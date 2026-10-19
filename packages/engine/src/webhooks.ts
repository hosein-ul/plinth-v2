import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, claimJobs, completeJob, desc, enqueue, eq, failJob, inArray, lte, schema, sql, type Database, type Executor } from "@plinth/db";
import { newId, randomToken, WEBHOOK_EVENT_TYPES, type WebhookEventType } from "@plinth/shared";
import type { Engine } from "./context";
import { EngineError } from "./context";
import { decryptSecret, encryptSecret, signWebhook } from "./crypto";
import { isBlockedAddress, pinnedPost } from "./safe-http";
import { loadIntentView } from "./view";

export const WEBHOOK_QUEUE = "webhook.deliver";
/** Delay before attempt N+1 (seconds). 8 attempts total spanning roughly a day. */
const RETRY_SCHEDULE = [30, 120, 600, 1800, 3600, 7200, 21600];
const MAX_ATTEMPTS = RETRY_SCHEDULE.length + 1;

// ------------------------------------------------------------------ SSRF guard


/** Reject URLs that would make our servers call internal services. Resolved at delivery time too (DNS rebinding). */
export async function assertSafeWebhookUrl(url: string, allowPrivate: boolean): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new EngineError("INVALID_URL", "Webhook URL is not valid", 400);
  }
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) {
    throw new EngineError("INVALID_URL", "Webhook URL must use https", 400);
  }
  if (u.username || u.password) throw new EngineError("INVALID_URL", "Webhook URL must not embed credentials", 400);
  if (allowPrivate) return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (ips.length === 0) throw new EngineError("INVALID_URL", "Webhook host does not resolve", 400);
  if (ips.some(isBlockedAddress)) throw new EngineError("INVALID_URL", "Webhook URL resolves to a private address", 400);
}

// ------------------------------------------------------------------ endpoints

export async function createEndpoint(
  e: Engine,
  merchantId: string,
  environment: "test" | "live",
  input: { url: string; description?: string; events: string[] },
) {
  await assertSafeWebhookUrl(input.url, e.cfg.allowPrivateWebhookTargets);
  for (const ev of input.events) {
    if (ev !== "*" && !(WEBHOOK_EVENT_TYPES as readonly string[]).includes(ev)) throw new EngineError("INVALID_EVENT", `Unknown event type ${ev}`, 400);
  }
  const secret = randomToken("whsec", 32);
  const id = newId("whe");
  await e.db.insert(schema.webhookEndpoints).values({
    id, merchantId, environment, url: input.url, description: input.description ?? null,
    secretEnc: encryptSecret(e.cfg.secretKey, secret), events: input.events,
  });
  // The signing secret is shown exactly once, at creation.
  return { id, url: input.url, events: input.events, status: "ACTIVE", secret };
}

// ------------------------------------------------------------------ emitting

/**
 * Record an event and fan it out to matching endpoints, inside the caller's transaction. `dedupeKey`
 * guarantees one logical event is emitted once even if the triggering code path runs again.
 */
export async function emitEvent(
  e: Engine,
  tx: Executor,
  args: { merchantId: string; environment: string; type: WebhookEventType; paymentIntentId?: string; dedupeKey: string; extra?: Record<string, unknown> },
): Promise<void> {
  const id = newId("evt");
  const object = args.paymentIntentId ? await loadIntentView(e, tx, args.paymentIntentId) : null;
  const payload = {
    id,
    object: "event",
    type: args.type,
    api_version: "2026-10-01",
    created_at: e.now().toISOString(),
    livemode: args.environment === "live",
    data: { object, ...(args.extra ?? {}) },
  };
  const inserted = await tx
    .insert(schema.webhookEvents)
    .values({ id, merchantId: args.merchantId, environment: args.environment, type: args.type, paymentIntentId: args.paymentIntentId ?? null, payload, dedupeKey: args.dedupeKey })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (inserted.length === 0) return; // already emitted

  const endpoints = await tx
    .select()
    .from(schema.webhookEndpoints)
    .where(and(eq(schema.webhookEndpoints.merchantId, args.merchantId), eq(schema.webhookEndpoints.environment, args.environment), eq(schema.webhookEndpoints.status, "ACTIVE")));
  for (const ep of endpoints) {
    if (!ep.events.includes("*") && !ep.events.includes(args.type)) continue;
    const deliveryId = newId("dlv");
    await tx.insert(schema.webhookDeliveries).values({ id: deliveryId, eventId: id, endpointId: ep.id, merchantId: args.merchantId, nextAttemptAt: e.now() }).onConflictDoNothing();
    await enqueue(tx, WEBHOOK_QUEUE, { deliveryId }, { dedupeKey: `${deliveryId}:1` });
  }
}

// ------------------------------------------------------------------ delivery

export async function deliverOnce(e: Engine, deliveryId: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<"ok" | "retry" | "abandoned" | "skipped"> {
  const [d] = await e.db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, deliveryId));
  if (!d || d.status === "SUCCEEDED" || d.status === "ABANDONED") return "skipped";
  const [ep] = await e.db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, d.endpointId));
  const [ev] = await e.db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, d.eventId));
  if (!ep || !ev) return "skipped";

  const attemptNumber = d.attemptCount + 1;
  const body = JSON.stringify(ev.payload);
  const ts = Math.floor(e.now().getTime() / 1000);
  const started = Date.now();
  let statusCode: number | null = null;
  let error: string | null = null;
  let snippet: string | null = null;
  try {
    await assertSafeWebhookUrl(ep.url, e.cfg.allowPrivateWebhookTargets);
    const secret = decryptSecret(e.cfg.secretKey, ep.secretEnc);
    const headers = {
      "content-type": "application/json",
      "user-agent": "Plinth-Webhooks/1",
      "plinth-signature": signWebhook(secret, body, ts),
      "plinth-event-id": ev.id,
      "plinth-delivery-id": d.id,
      "plinth-delivery-attempt": String(attemptNumber),
    };
    let status: number;
    if (opts.fetchImpl) {
      // A caller-supplied transport (tests) replaces the network layer.
      const res = await opts.fetchImpl(ep.url, { method: "POST", redirect: "manual", headers, body, signal: AbortSignal.timeout(10_000) });
      status = res.status;
      snippet = (await res.text().catch(() => "")).slice(0, 300);
    } else {
      // Connects only to the addresses that passed the private-range check, and never follows a redirect.
      const res = await pinnedPost(ep.url, { headers, body, timeoutMs: 10_000, allowPrivate: e.cfg.allowPrivateWebhookTargets });
      status = res.status;
      snippet = res.text.slice(0, 300);
    }
    statusCode = status;
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 300) : "delivery error";
  }
  const ok = error === null;
  const delay = RETRY_SCHEDULE[attemptNumber - 1];
  const abandoned = !ok && attemptNumber >= MAX_ATTEMPTS;

  await e.db.transaction(async (tx) => {
    await tx.insert(schema.webhookAttempts).values({
      id: newId("dlv").replace("dlv_", "att_"), deliveryId: d.id, attemptNumber, statusCode, error,
      durationMs: Date.now() - started, responseSnippet: snippet,
    });
    await tx.update(schema.webhookDeliveries).set({
      status: ok ? "SUCCEEDED" : abandoned ? "ABANDONED" : "RETRYING",
      attemptCount: attemptNumber, lastStatusCode: statusCode, lastError: error, lastAttemptAt: e.now(),
      nextAttemptAt: ok || abandoned ? null : new Date(e.now().getTime() + (delay ?? 21600) * 1000 * (0.9 + Math.random() * 0.2)),
    }).where(eq(schema.webhookDeliveries.id, d.id));
    await tx.update(schema.webhookEndpoints).set({ consecutiveFailures: ok ? 0 : sql`${schema.webhookEndpoints.consecutiveFailures} + 1` }).where(eq(schema.webhookEndpoints.id, ep.id));
    if (!ok && !abandoned) {
      await enqueue(tx, WEBHOOK_QUEUE, { deliveryId: d.id }, { dedupeKey: `${d.id}:${attemptNumber + 1}`, runAt: new Date(e.now().getTime() + (delay ?? 21600) * 1000) });
    }
  });
  return ok ? "ok" : abandoned ? "abandoned" : "retry";
}

/** Worker loop body: claim due delivery jobs and attempt them. */
export async function processWebhookJobs(e: Engine, opts: { fetchImpl?: typeof fetch; limit?: number } = {}): Promise<number> {
  const jobs = await claimJobs(e.db, WEBHOOK_QUEUE, opts.limit ?? 20, 30_000);
  for (const job of jobs) {
    try {
      await deliverOnce(e, String(job.payload.deliveryId), opts);
      await completeJob(e.db, job.id);
    } catch (err) {
      await failJob(e.db, job, err instanceof Error ? err.message : String(err));
    }
  }
  return jobs.length;
}

/** Manual retry of a failed/abandoned delivery from the developer dashboard. */
export async function retryDelivery(e: Engine, merchantId: string, deliveryId: string): Promise<void> {
  const [d] = await e.db.select().from(schema.webhookDeliveries).where(and(eq(schema.webhookDeliveries.id, deliveryId), eq(schema.webhookDeliveries.merchantId, merchantId)));
  if (!d) throw new EngineError("NOT_FOUND", "Delivery not found", 404);
  if (d.status === "SUCCEEDED") throw new EngineError("INVALID_STATE", "Delivery already succeeded", 409);
  await e.db.transaction(async (tx) => {
    await tx.update(schema.webhookDeliveries).set({ status: "RETRYING", nextAttemptAt: e.now() }).where(eq(schema.webhookDeliveries.id, d.id));
    await enqueue(tx, WEBHOOK_QUEUE, { deliveryId: d.id }, { dedupeKey: `${d.id}:manual:${Date.now()}` });
  });
}

export async function listDeliveries(db: Database, merchantId: string, limit = 50) {
  return db
    .select({
      id: schema.webhookDeliveries.id, status: schema.webhookDeliveries.status, attempts: schema.webhookDeliveries.attemptCount,
      lastStatusCode: schema.webhookDeliveries.lastStatusCode, lastError: schema.webhookDeliveries.lastError,
      lastAttemptAt: schema.webhookDeliveries.lastAttemptAt, nextAttemptAt: schema.webhookDeliveries.nextAttemptAt,
      createdAt: schema.webhookDeliveries.createdAt, eventId: schema.webhookEvents.id, eventType: schema.webhookEvents.type,
      endpointId: schema.webhookEndpoints.id, endpointUrl: schema.webhookEndpoints.url,
    })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhookEvents, eq(schema.webhookEvents.id, schema.webhookDeliveries.eventId))
    .innerJoin(schema.webhookEndpoints, eq(schema.webhookEndpoints.id, schema.webhookDeliveries.endpointId))
    .where(eq(schema.webhookDeliveries.merchantId, merchantId))
    .orderBy(desc(schema.webhookDeliveries.createdAt))
    .limit(limit);
}

export { inArray, lte };
