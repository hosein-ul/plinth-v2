import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt, ne, schema } from "@plinth/db";
import { newId, randomToken } from "@plinth/shared";
import { audit, type Actor } from "./audit";
import { EngineError, type Engine } from "./context";
import { hashPassword, sha256Hex, verifyPassword } from "./crypto";

export type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";
export type Environment = "test" | "live";

export interface AuthContext {
  merchantId: string;
  environment: Environment;
  actor: Actor;
  /** API keys act with DEVELOPER rights; dashboard sessions carry the member's role. */
  role: Role;
  via: "api_key" | "session";
}

/** What each role may do. Money-moving configuration (wallets, team) needs OWNER/ADMIN. */
const PERMISSIONS = {
  read: ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"],
  payments: ["OWNER", "ADMIN", "DEVELOPER"],
  developers: ["OWNER", "ADMIN", "DEVELOPER"],
  wallets: ["OWNER", "ADMIN"],
  team: ["OWNER", "ADMIN"],
  settings: ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export function requirePermission(ctx: AuthContext, p: keyof typeof PERMISSIONS): void {
  if (!(PERMISSIONS[p] as readonly Role[]).includes(ctx.role)) throw new EngineError("FORBIDDEN", `Your role (${ctx.role}) cannot perform this action`, 403);
}

// ------------------------------------------------------------------ accounts & sessions

export async function signup(e: Engine, input: { business_name: string; email: string; password: string }, actor: Actor) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email));
  if (existing) throw new EngineError("EMAIL_TAKEN", "An account with this email already exists", 409);
  const merchantId = newId("mer");
  const userId = newId("usr");
  const passwordHash = await hashPassword(input.password);
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.merchants).values({ id: merchantId, name: input.business_name.trim() });
    await tx.insert(schema.merchantUsers).values({ id: userId, merchantId, email, passwordHash, role: "OWNER" });
    await audit(tx, { merchantId, actor, action: "merchant.created", targetType: "merchant", targetId: merchantId });
  });
  return { merchantId, userId };
}

export async function login(e: Engine, email: string, password: string, actor: Actor) {
  const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email.trim().toLowerCase()));
  // Always run a hash to keep timing flat for unknown emails.
  const ok = u ? await verifyPassword(password, u.passwordHash) : (await hashPassword(password), false);
  if (!u || !ok) throw new EngineError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  return startSession(e, u.id, actor);
}

/** Open a dashboard session for an already-authenticated user (password or an external identity). */
export async function startSession(e: Engine, userId: string, actor: Actor) {
  const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, userId));
  if (!u) throw new EngineError("INVALID_CREDENTIALS", "Unknown user", 401);
  const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, u.merchantId));
  if (m?.status !== "ACTIVE") throw new EngineError("ACCOUNT_SUSPENDED", "This account is suspended", 403);
  const token = randomToken("sess", 32);
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.sessions).values({ id: sha256Hex(token), userId: u.id, merchantId: u.merchantId, expiresAt: new Date(e.now().getTime() + e.cfg.sessionTtlSeconds * 1000) });
    await tx.update(schema.merchantUsers).set({ lastLoginAt: e.now() }).where(eq(schema.merchantUsers.id, u.id));
    await audit(tx, { merchantId: u.merchantId, actor: { ...actor, type: "USER", id: u.id }, action: "user.login" });
  });
  return { token, user: { id: u.id, email: u.email, role: u.role as Role }, merchant: { id: m.id, name: m.name } };
}

export async function logout(e: Engine, token: string) {
  await e.db.delete(schema.sessions).where(eq(schema.sessions.id, sha256Hex(token)));
}

/** Resolve a bearer credential (session token or API key) into a merchant context. */
export async function authenticate(e: Engine, bearer: string, requestedEnv?: Environment, ip?: string): Promise<AuthContext> {
  if (bearer.startsWith("sk_test_") || bearer.startsWith("sk_live_")) {
    const [k] = await e.db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.keyHash, sha256Hex(bearer)), isNull(schema.apiKeys.revokedAt)));
    if (!k) throw new EngineError("INVALID_API_KEY", "Invalid or revoked API key", 401);
    const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, k.merchantId));
    if (m?.status !== "ACTIVE") throw new EngineError("ACCOUNT_SUSPENDED", "This account is suspended", 403);
    if (!k.lastUsedAt || e.now().getTime() - k.lastUsedAt.getTime() > 60_000) {
      await e.db.update(schema.apiKeys).set({ lastUsedAt: e.now() }).where(eq(schema.apiKeys.id, k.id));
    }
    return { merchantId: k.merchantId, environment: k.environment as Environment, actor: { type: "API_KEY", id: k.id, ip }, role: "DEVELOPER", via: "api_key" };
  }
  if (bearer.startsWith("sess_")) {
    const [s] = await e.db.select().from(schema.sessions).where(eq(schema.sessions.id, sha256Hex(bearer)));
    if (!s || s.expiresAt < e.now()) throw new EngineError("INVALID_SESSION", "Session expired; please sign in again", 401);
    const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, s.userId));
    if (!u) throw new EngineError("INVALID_SESSION", "Session is no longer valid", 401);
    // A suspended merchant keeps no working sessions (login and API keys already refuse it).
    const [m] = await e.db.select({ status: schema.merchants.status }).from(schema.merchants).where(eq(schema.merchants.id, s.merchantId));
    if (m?.status !== "ACTIVE") throw new EngineError("ACCOUNT_SUSPENDED", "This account is suspended", 403);
    return { merchantId: s.merchantId, environment: requestedEnv ?? "test", actor: { type: "USER", id: u.id, ip }, role: u.role as Role, via: "session" };
  }
  throw new EngineError("INVALID_CREDENTIALS", "Missing or malformed credentials", 401);
}

// ------------------------------------------------------------------ API keys

export async function createApiKey(e: Engine, ctx: AuthContext, input: { name: string; environment: Environment }, rotatedFromId?: string) {
  requirePermission(ctx, "developers");
  const secret = randomBytes(32).toString("base64url");
  const key = `sk_${input.environment}_${secret}`;
  const id = newId("key");
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.apiKeys).values({ id, merchantId: ctx.merchantId, environment: input.environment, name: input.name, prefix: key.slice(0, 14), keyHash: sha256Hex(key), rotatedFromId: rotatedFromId ?? null });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: rotatedFromId ? "api_key.rotated" : "api_key.created", targetType: "api_key", targetId: id, data: { environment: input.environment, name: input.name } });
  });
  // Only the hash is stored: the full key is returned exactly once.
  return { id, name: input.name, environment: input.environment, prefix: key.slice(0, 14), key };
}

export async function rotateApiKey(e: Engine, ctx: AuthContext, keyId: string, revokeOldAfterMinutes = 0) {
  requirePermission(ctx, "developers");
  const [old] = await e.db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.merchantId, ctx.merchantId), isNull(schema.apiKeys.revokedAt)));
  if (!old) throw new EngineError("NOT_FOUND", "API key not found", 404);
  const fresh = await createApiKey(e, ctx, { name: old.name, environment: old.environment as Environment }, old.id);
  // Grace period lets deployments roll over; 0 revokes immediately.
  if (revokeOldAfterMinutes <= 0) await revokeApiKey(e, ctx, keyId);
  return { ...fresh, previousKeyId: keyId, previousKeyRevoked: revokeOldAfterMinutes <= 0 };
}

export async function revokeApiKey(e: Engine, ctx: AuthContext, keyId: string) {
  requirePermission(ctx, "developers");
  const res = await e.db.update(schema.apiKeys).set({ revokedAt: e.now() }).where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.merchantId, ctx.merchantId), isNull(schema.apiKeys.revokedAt))).returning({ id: schema.apiKeys.id });
  if (res.length === 0) throw new EngineError("NOT_FOUND", "API key not found", 404);
  await audit(e.db, { merchantId: ctx.merchantId, actor: ctx.actor, action: "api_key.revoked", targetType: "api_key", targetId: keyId });
}

export async function listApiKeys(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.merchantId, ctx.merchantId));
  return rows.map((k) => ({ id: k.id, name: k.name, environment: k.environment, prefix: k.prefix, last_used_at: k.lastUsedAt?.toISOString() ?? null, revoked_at: k.revokedAt?.toISOString() ?? null, created_at: k.createdAt.toISOString() }));
}

// ------------------------------------------------------------------ team

export async function listTeam(e: Engine, ctx: AuthContext) {
  const all = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.merchantId, ctx.merchantId));
  const rows = all.filter((u) => !u.email.endsWith(REMOVED_EMAIL_SUFFIX));
  return rows.map((u) => ({ id: u.id, email: u.email, role: u.role, last_login_at: u.lastLoginAt?.toISOString() ?? null, created_at: u.createdAt.toISOString() }));
}

/** Members who were removed keep their row (other tables point at it) but can no longer sign in. */
export const REMOVED_EMAIL_SUFFIX = "@removed.plinth.invalid";

// ------------------------------------------------------------------ session hygiene

/** End every session of one user, optionally keeping the one in use. */
export async function revokeSessions(e: Engine, scope: { userId: string; keepToken?: string }): Promise<number> {
  const conds = [eq(schema.sessions.userId, scope.userId)];
  if (scope.keepToken) conds.push(ne(schema.sessions.id, sha256Hex(scope.keepToken)));
  const gone = await e.db.delete(schema.sessions).where(and(...conds)).returning({ id: schema.sessions.id });
  return gone.length;
}

/** Change the signed-in user's password (current password required) and end all their other sessions. */
export async function changePassword(e: Engine, ctx: AuthContext, input: { current_password: string; new_password: string }, currentToken: string) {
  if (ctx.via !== "session" || !ctx.actor.id) throw new EngineError("SESSION_REQUIRED", "Sign in to the dashboard to do this", 403);
  const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, ctx.actor.id));
  if (!u || !(await verifyPassword(input.current_password, u.passwordHash))) throw new EngineError("REAUTH_FAILED", "The current password is not correct.", 403);
  const passwordHash = await hashPassword(input.new_password);
  await e.db.transaction(async (tx) => {
    await tx.update(schema.merchantUsers).set({ passwordHash }).where(eq(schema.merchantUsers.id, u.id));
    await tx.delete(schema.sessions).where(and(eq(schema.sessions.userId, u.id), ne(schema.sessions.id, sha256Hex(currentToken))));
    await audit(tx, { merchantId: u.merchantId, actor: ctx.actor, action: "user.password_changed", targetType: "user", targetId: u.id });
  });
  return { ok: true };
}

/** Worker housekeeping: expired sessions are useless and the table would otherwise grow without bound. */
export async function pruneSessions(e: Engine): Promise<number> {
  const cutoff = new Date(e.now().getTime() - 86_400_000);
  const gone = await e.db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, cutoff)).returning({ id: schema.sessions.id });
  return gone.length;
}
