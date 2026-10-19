import { createHash, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { eq, and, schema } from "@plinth/db";
import { newId } from "@plinth/shared";
import { authenticate, EngineError, type AuthContext, type Engine } from "@plinth/engine";
import { handleMcpHttp } from "@plinth/mcp/http";
import type { RouteDef } from "./define";
import { buildRoutes } from "./routes";
import { FailureLimiter } from "./limits";

export interface ServerOptions {
  /** Operator token for /admin/* (disabled when unset). */
  adminToken?: string;
  corsOrigins?: string[];
  trustProxy?: boolean;
  logger?: boolean;
  rateLimitDisabled?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /** How the route authenticates; the rate limiter keys anonymous routes by IP only. */
    authKind?: string;
  }
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(sha(a));
  const y = Buffer.from(sha(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

function errorBody(type: string, code: string, message: string, requestId: string, details?: unknown) {
  return { error: { type, code, message, request_id: requestId, ...(details ? { details } : {}) } };
}

export async function buildServer(engine: Engine, opts: ServerOptions = {}): Promise<{ app: FastifyInstance; routes: RouteDef[] }> {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.trustProxy ?? false, bodyLimit: 100 * 1024, genReqId: () => newId("evt").replace("evt_", "req_"), disableRequestLogging: true });
  const routes = buildRoutes(engine);

  // Browsers and HTTP clients often send `content-type: application/json` with no body (for example a button that only POSTs).
  // Treat that as an empty object instead of failing with a parser error.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = typeof body === "string" ? body : "";
    if (text.trim() === "") return done(null, {});
    try { done(null, JSON.parse(text)); } catch { const err = new Error("Request body is not valid JSON") as Error & { statusCode: number }; err.statusCode = 400; done(err, undefined); }
  });
  if (opts.corsOrigins?.length) await app.register(cors, { origin: opts.corsOrigins, methods: ["GET", "POST", "PATCH", "DELETE"], allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-plinth-environment"] });
  if (!opts.rateLimitDisabled) {
    await app.register(rateLimit, {
      global: true, max: 600, timeWindow: "1 minute",
      // Anonymous routes are budgeted per IP no matter what headers the caller sends (a client must not be able to pick its own bucket).
      // Authenticated routes are budgeted per credential; credentials that fail are additionally counted per IP below.
      keyGenerator: (req) => {
        const kind = (req.routeOptions?.config as { authKind?: string } | undefined)?.authKind;
        const cred = req.headers.authorization;
        return kind === "none" || !cred ? `ip:${req.ip}` : `k:${sha(String(cred)).slice(0, 24)}`;
      },
      errorResponseBuilder: (_req, ctx) => new EngineError("RATE_LIMITED", `Too many requests. Retry in ${Math.ceil(ctx.ttl / 1000)}s.`, 429),
    });
  }

  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "no-store");
    reply.header("x-frame-options", "DENY");
    if (process.env.NODE_ENV === "production") reply.header("strict-transport-security", "max-age=63072000; includeSubDomains");
    return payload;
  });

  app.setNotFoundHandler((req, reply) => reply.status(404).send(errorBody("invalid_request_error", "NOT_FOUND", "Route not found", String(req.id))));
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    const rid = String(req.id);
    if (err instanceof EngineError) return reply.status(err.status).send(errorBody(err.status >= 500 ? "api_error" : "invalid_request_error", err.code, err.message, rid, err.details));
    if (err instanceof ZodError) return reply.status(400).send(errorBody("invalid_request_error", "VALIDATION_FAILED", "Request validation failed", rid, err.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send(errorBody("invalid_request_error", err.code ?? "BAD_REQUEST", err.message, rid));
    app.log.error({ err: err.message, rid }, "unhandled error");
    // Never leak internals (stack traces, SQL) to clients.
    return reply.status(500).send(errorBody("api_error", "INTERNAL", "Something went wrong on our side", rid));
  });

  // Wrong credentials are counted per client IP: a caller cannot dodge the per-credential budget by inventing credentials.
  const badCredentials = new FailureLimiter(60, 60_000);
  const authenticateReq = async (req: FastifyRequest, def: RouteDef): Promise<AuthContext | null> => {
    if (def.auth === "none") return null;
    try {
      return await authenticateReqInner(req, def);
    } catch (err) {
      // Only FAILED authentication is slowed down. A caller with a valid credential is never refused because of someone else's bad guesses
      // (behind a proxy that is not trusted, many clients can share one address).
      if (err instanceof EngineError && err.status === 401) {
        const wait = badCredentials.retryAfter(req.ip);
        badCredentials.fail(req.ip);
        if (wait > 0) throw new EngineError("RATE_LIMITED", `Too many failed authentication attempts. Retry in ${wait}s.`, 429);
      }
      throw err;
    }
  };
  const authenticateReqInner = async (req: FastifyRequest, def: RouteDef): Promise<AuthContext | null> => {
    if (def.auth === "admin") {
      const tok = String(req.headers["x-admin-token"] ?? "");
      if (!opts.adminToken || !tok || !safeEqual(tok, opts.adminToken)) throw new EngineError("UNAUTHENTICATED", "Operator authentication required", 401);
      return null;
    }
    const h = String(req.headers.authorization ?? "");
    const m = /^Bearer\s+(\S+)$/i.exec(h);
    if (!m) throw new EngineError("UNAUTHENTICATED", "Provide your API key as `Authorization: Bearer sk_...`", 401);
    const envHeader = String(req.headers["x-plinth-environment"] ?? "test");
    const ctx = await authenticate(engine, m[1]!, envHeader === "live" ? "live" : "test", req.ip);
    if (def.auth === "session" && ctx.via !== "session") throw new EngineError("FORBIDDEN", "This action requires a dashboard session, not an API key", 403);
    return ctx;
  };

  for (const def of routes) {
    app.route({
      method: def.method, url: def.path,
      config: { authKind: def.auth, rateLimit: def.rateLimit ? { max: def.rateLimit, timeWindow: "1 minute" } : undefined },
      handler: async (req: FastifyRequest, reply: FastifyReply) => {
        const auth = await authenticateReq(req, def);
        req.auth = auth;
        const body = def.body ? def.body.parse(req.body ?? {}) : undefined;
        const query = def.query ? def.query.parse(req.query ?? {}) : {};
        const run = async () => def.handler({ req, body, query, params: req.params as Record<string, string>, auth });
        const status = def.successStatus ?? 200;

        const idemKey = def.idempotent ? String(req.headers["idempotency-key"] ?? "") : "";
        if (!idemKey || !auth) {
          return reply.status(status).send(await run());
        }
        if (idemKey.length > 200) throw new EngineError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is too long", 400);
        // Test and live traffic never share a key: the same Idempotency-Key in the other environment is a different request.
        const scope = `${auth.merchantId}:${auth.environment}`;
        const requestHash = sha(`${def.method} ${req.url} ${JSON.stringify(req.body ?? {})}`);
        const claimed = await engine.db.insert(schema.idempotencyKeys).values({ id: newId("evt").replace("evt_", "idm_"), merchantId: scope, key: idemKey, requestHash }).onConflictDoNothing().returning({ id: schema.idempotencyKeys.id });
        if (claimed.length === 0) {
          const [prev] = await engine.db.select().from(schema.idempotencyKeys).where(and(eq(schema.idempotencyKeys.merchantId, scope), eq(schema.idempotencyKeys.key, idemKey)));
          if (prev!.requestHash !== requestHash) throw new EngineError("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used with a different request", 422);
          if (prev!.responseStatus === null) throw new EngineError("IDEMPOTENT_REQUEST_IN_PROGRESS", "A request with this Idempotency-Key is still being processed", 409);
          reply.header("idempotent-replayed", "true");
          return reply.status(prev!.responseStatus).send(prev!.responseBody);
        }
        try {
          const result = await run();
          await engine.db.update(schema.idempotencyKeys).set({ responseStatus: status, responseBody: result as never }).where(and(eq(schema.idempotencyKeys.merchantId, scope), eq(schema.idempotencyKeys.key, idemKey)));
          return reply.status(status).send(result);
        } catch (err) {
          if (err instanceof EngineError && err.status < 500) {
            // Deterministic client errors are replayed identically.
            await engine.db.update(schema.idempotencyKeys).set({ responseStatus: err.status, responseBody: errorBody("invalid_request_error", err.code, err.message, String(req.id), err.details) as never }).where(and(eq(schema.idempotencyKeys.merchantId, scope), eq(schema.idempotencyKeys.key, idemKey)));
          } else {
            // Transient/unknown failure: release the key so the client can retry.
            await engine.db.delete(schema.idempotencyKeys).where(and(eq(schema.idempotencyKeys.merchantId, scope), eq(schema.idempotencyKeys.key, idemKey)));
          }
          throw err;
        }
      },
    });
  }
  // ---- the hosted MCP server (Streamable HTTP, stateless). Same API, same key, same rights: every tool call goes through this app's own routes.
  const mcpFetch = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const r = await app.inject({ method: (init?.method ?? "GET") as "GET", url: u.pathname + u.search, headers: init?.headers as Record<string, string>, payload: init?.body as string | undefined });
    return new Response(r.body, { status: r.statusCode, headers: r.headers as Record<string, string> });
  }) as typeof fetch;
  const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });
  app.post("/mcp", async (req, reply) => {
    const auth = req.headers.authorization;
    const key = typeof auth === "string" ? auth.replace(/^Bearer\s+/i, "").trim() : "";
    if (!/^sk_(test|live)_/.test(key)) {
      return reply.status(401).header("www-authenticate", 'Bearer realm="plinth-mcp"').send(rpcError(-32001, "Send your Plinth secret key as the header 'Authorization: Bearer sk_...'. Create one in the dashboard under Developers, API keys."));
    }
    reply.hijack();
    try {
      await handleMcpHttp(req.raw, reply.raw, req.body, { apiUrl: "http://plinth.internal", apiKey: key, fetchImpl: mcpFetch });
    } catch (err) {
      app.log.error({ err: err instanceof Error ? err.message : String(err) }, "mcp request failed");
      if (!reply.raw.headersSent) reply.raw.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify(rpcError(-32603, "Internal error")));
    }
  });
  // Stateless server: there is no session to stream from or to close.
  for (const method of ["GET", "DELETE"] as const) {
    app.route({ method, url: "/mcp", handler: async (_req, reply) => reply.status(405).header("allow", "POST").send(rpcError(-32000, "This MCP server is stateless: send JSON-RPC requests with POST.")) });
  }

  return { app, routes };
}
