import { and, desc, eq, inArray, lt, ne, schema, sql, type Executor } from "@plinth/db";
import {
  canTransition,
  deriveIntentStatus,
  newId,
  type DerivedState,
  type IntentStatus,
  type TransferFact,
  type WebhookEventType,
} from "@plinth/shared";
import type { Engine } from "./context";
import { audit } from "./audit";
import { planSettlement } from "./settlement-plan";
import { emitEvent } from "./webhooks";

/**
 * The ONLY place a payment intent's status and accounting snapshot are written. Everything it reads
 * is a verified on-chain observation (transactions), an orchestration record (settlements) or an
 * operator record (refunds) — never a client claim. Safe to call repeatedly: it recomputes from facts.
 *
 * Runs inside the caller's DB transaction so the status change, timeline entry, webhook event and
 * follow-up settlement job commit atomically.
 */
export async function recomputeIntent(e: Engine, tx: Executor, intentId: string): Promise<DerivedState | null> {
  const [intent] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentId)).for("update");
  if (!intent) return null;

  const observed = await tx
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.paymentIntentId, intentId), inArray(schema.transactions.kind, ["INCOMING_TRANSFER", "WALLET_PAYMENT", "SWEEP"])));

  const facts: TransferFact[] = observed
    .filter((t) => t.kind !== "SWEEP")
    .map((t) => ({
      status: t.status as TransferFact["status"],
      amount: t.amount,
      official: t.isOfficialAsset,
      blockTimestamp: Math.floor((t.blockTimestamp ?? e.now()).getTime() / 1000),
    }));

  // Funds that are final AND inside the merchant vault: confirmed sweeps + wallet payments (paid straight to the vault).
  const settledAmount = observed
    .filter((t) => t.status === "FINAL" && t.isOfficialAsset && (t.kind === "SWEEP" || t.kind === "WALLET_PAYMENT"))
    .reduce((a, t) => a + t.amount, 0n);

  // The platform fee carried by those same final movements; the merchant received settled - fee.
  const feeAmount = observed
    .filter((t) => t.status === "FINAL" && t.isOfficialAsset && (t.kind === "SWEEP" || t.kind === "WALLET_PAYMENT"))
    .reduce((a, t) => a + (t.feeAmount ?? 0n), 0n);

  const refunds = await tx.select().from(schema.refunds).where(eq(schema.refunds.paymentIntentId, intentId));
  const refundRequested = refunds.some((r) => r.status === "REQUESTED");
  const refundedAmount = refunds.filter((r) => r.status === "COMPLETED").reduce((a, r) => a + r.amount, 0n);
  const [merchant] = await tx.select().from(schema.merchants).where(eq(schema.merchants.id, intent.merchantId));

  const derive = async () => {
    const sett = await tx.select().from(schema.settlements).where(eq(schema.settlements.paymentIntentId, intentId)).orderBy(desc(schema.settlements.createdAt));
    const inFlight = sett.some((s) => s.status === "QUEUED" || s.status === "SUBMITTED") || observed.some((t) => t.kind === "SWEEP" && (t.status === "DETECTED" || t.status === "CONFIRMING"));
    const settlementFailed = !inFlight && sett[0]?.status === "FAILED";
    return deriveIntentStatus({
      amount: intent.amount,
      expiresAt: Math.floor(intent.expiresAt.getTime() / 1000),
      now: Math.floor(e.now().getTime() / 1000),
      policy: { underpaymentToleranceBps: merchant?.underpaymentToleranceBps ?? 0 },
      transfers: facts,
      settledAmount,
      settlementInFlight: inFlight,
      settlementFailed,
      refundRequested,
      refundedAmount,
      // The platform fee is not refunded: a payment is fully refunded once everything the merchant received has been returned.
      refundableAmount: settledAmount > 0n ? settledAmount - feeAmount : undefined,
    });
  };

  // Funds ready to move? Create the sweep in this same transaction (transactional outbox), then derive
  // the status so it already reflects SETTLEMENT_PENDING.
  const provisional = await derive();
  await planSettlement(e, tx, intentId, { eligibleSatisfied: provisional.eligibleAmount >= intent.amount });
  const d = await derive();

  const prev = intent.status as IntentStatus;
  const next = d.status;
  const changed = prev !== next;
  const now = e.now();

  await tx
    .update(schema.paymentIntents)
    .set({
      status: next,
      amountPending: d.pendingAmount,
      amountFinal: d.finalAmount,
      amountEligible: d.eligibleAmount,
      amountSettled: settledAmount,
      feeAmount,
      netAmount: settledAmount - feeAmount,
      amountRefunded: refundedAmount,
      excessAmount: d.excessAmount,
      updatedAt: changed ? now : intent.updatedAt,
      paidAt: intent.paidAt ?? (next === "PAID" || next === "OVERPAID" ? now : null),
      settledAt: next === "SETTLED" ? (intent.settledAt ?? now) : intent.settledAt,
    })
    .where(eq(schema.paymentIntents.id, intentId));

  if (changed) {
    if (!canTransition(prev, next)) {
      // Facts win over the guard, but an unexpected edge is a defect worth surfacing.
      await audit(tx, { merchantId: intent.merchantId, actor: { type: "SYSTEM" }, action: "payment.unexpected_transition", targetType: "payment_intent", targetId: intentId, data: { from: prev, to: next } });
      e.log.warn("unexpected payment status transition", { intentId, from: prev, to: next });
    }
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: intentId, type: "status.changed", data: { from: prev, to: next } });
    await emitStatusEvents(e, tx, intent, prev, next, d);
  }

  return d;
}

/** Statuses in which the invoice is financially satisfied (amount + policy met by FINAL funds). */
const SATISFIED: IntentStatus[] = ["PAID", "OVERPAID", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED"];
const OFFICIAL_SEEN: IntentStatus[] = ["DETECTED", "CONFIRMING", "PAID", "OVERPAID", "SETTLEMENT_PENDING", "SETTLED", "UNDERPAID", "LATE_PAYMENT", "SETTLEMENT_FAILED"];

async function emitStatusEvents(e: Engine, tx: Executor, i: typeof schema.paymentIntents.$inferSelect, prev: IntentStatus, next: IntentStatus, d: DerivedState) {
  const send = (type: WebhookEventType) =>
    emitEvent(e, tx, { merchantId: i.merchantId, environment: i.environment, type, paymentIntentId: i.id, dedupeKey: `${type}:${i.id}` });

  if (OFFICIAL_SEEN.includes(next) && !OFFICIAL_SEEN.includes(prev)) await send("payment.detected");
  // "Satisfied" can be entered directly at SETTLEMENT_PENDING (e.g. a top-up after a partial sweep).
  if (SATISFIED.includes(next) && !SATISFIED.includes(prev)) {
    await send("payment.confirmed");
    if (d.excessAmount > 0n) await send("payment.overpaid");
  }
  if (next === "SETTLED") await send("payment.completed");
  if (next === "UNDERPAID") await send("payment.underpaid");
  if (next === "EXPIRED") await send("payment.expired");
  if (next === "LATE_PAYMENT") await send("payment.late");
  if (next === "INVALID_ASSET") await send("payment.invalid_asset");
  if (next === "SETTLEMENT_FAILED") {
    await e.alerts.raise({ key: `settlement-failed:${i.id}`, severity: "critical", title: "Settlement failed", detail: { paymentIntentId: i.id } });
  }
}

/** Expire intents whose deadline passed (worker tick). Recompute classifies EXPIRED/UNDERPAID/etc. */
export async function expireDueIntents(e: Engine, limit = 200): Promise<number> {
  const due = await e.db
    .select({ id: schema.paymentIntents.id })
    .from(schema.paymentIntents)
    .where(and(inArray(schema.paymentIntents.status, ["CREATED", "AWAITING_PAYMENT", "DETECTED", "CONFIRMING", "INVALID_ASSET"]), lt(schema.paymentIntents.expiresAt, e.now())))
    .limit(limit);
  for (const { id } of due) await e.db.transaction((tx) => recomputeIntent(e, tx, id));
  return due.length;
}

/**
 * Re-evaluate intents that hold final funds not yet in the vault and have no settlement in flight —
 * e.g. after a failed attempt's back-off elapsed or an operator fixed the cause. Without this, a
 * failed settlement would only be retried when an unrelated on-chain event happened to touch it.
 */
export async function replanSettlements(e: Engine, limit = 100): Promise<number> {
  const rows = await e.db
    .select({ id: schema.paymentIntents.id })
    .from(schema.paymentIntents)
    .where(and(sql`${schema.paymentIntents.amountFinal} > ${schema.paymentIntents.amountSettled}`, ne(schema.paymentIntents.status, "REFUNDED")))
    // Random order: rows with permanently unswept dust must not occupy the same fixed window on every pass.
    .orderBy(sql`random()`)
    .limit(limit);
  for (const { id } of rows) await e.db.transaction((tx) => recomputeIntent(e, tx, id));
  return rows.length;
}
