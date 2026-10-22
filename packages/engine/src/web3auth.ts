import * as jose from "jose";
import { and, eq, inArray, isNull, schema } from "@plinth/db";
import { newId, randomToken } from "@plinth/shared";
import { audit, type Actor } from "./audit";
import { startSession } from "./auth";
import { EngineError, type Engine } from "./context";
import { hashPassword } from "./crypto";

/**
 * Web3Auth identity tokens. The browser signs a user in with Web3Auth and sends us the identity token; we never trust the
 * browser's claims, only a token whose signature verifies against Web3Auth's published keys for OUR client id.
 *
 * Social and email logins are signed by api-auth.web3auth.io; external wallets (MetaMask and similar) by authjs.web3auth.io; SDK v11 sessions by the citadel service.
 * Source: Embedded Wallets "identity token" documentation.
 */
const SOURCES = [
  { jwks: "https://api-auth.web3auth.io/jwks", issuer: "https://api-auth.web3auth.io" },
  { jwks: "https://authjs.web3auth.io/jwks", issuer: "https://authjs.web3auth.io" },
  // SDK v11 signs wallet and social sessions through the "citadel" service. Found by decoding a rejected token's kid and issuer.
  { jwks: "https://api.web3auth.io/citadel-service/.well-known/jwks.json", issuer: "web3auth.io" },
] as const;

export interface Web3AuthIdentity {
  /** The preferred stable id for this person. */
  subject: string;
  /**
   * Every stable id this token can be reduced to, `subject` first. Token shapes differ between SDK versions and
   * dashboard settings (a wallet address, a provider user id, the plain `sub`), so an account is found by ANY of them
   * and a returning user never ends up with a second account because the token changed shape.
   */
  aliases?: string[];
  email: string | null;
  name: string | null;
  /** True only when the provider vouches that the user controls `email` (Google, Apple, passwordless email OTP). */
  emailVerified: boolean;
  /** The login method, e.g. "google" or "email_passwordless"; null for wallet logins. */
  connection: string | null;
  /** When the identity token was issued (unix seconds). Used to insist on a fresh sign-in for sensitive changes. */
  issuedAt: number | null;
}

/**
 * Login methods whose email address the user has really proven. Others (X, Discord, ...) may carry unverified emails.
 * Matched as whole words against `authConnection` and `groupedAuthConnectionId`, because a Google login can arrive as
 * authConnection "web3auth" with groupedAuthConnectionId "web3auth-google-sapphire-mainnet".
 */
const EMAIL_VERIFYING_WORDS = new Set(["google", "apple", "passwordless"]);

type KeySet = Parameters<typeof jose.jwtVerify>[1];
const remote = new Map<string, KeySet>();
const keySetFor = (url: string): KeySet => {
  let k = remote.get(url);
  if (!k) { k = jose.createRemoteJWKSet(new URL(url)); remote.set(url, k); }
  return k;
};

/** Verify a Web3Auth identity token and reduce it to a stable subject. `keys` is injectable for tests. */
export async function verifyWeb3AuthToken(idToken: string, clientId: string, keys?: KeySet): Promise<Web3AuthIdentity> {
  let payload: jose.JWTPayload | undefined;
  let lastError: unknown;
  for (const s of SOURCES) {
    try {
      ({ payload } = await jose.jwtVerify(idToken, keys ?? keySetFor(s.jwks), { algorithms: ["ES256"], issuer: s.issuer, audience: clientId }));
      break;
    } catch (err) { lastError = err; }
  }
  if (!payload) {
    // Say what the token claims about itself (never the token) so a rejected sign-in can be diagnosed from the error alone.
    let peek = "unreadable";
    try {
      const h = jose.decodeProtectedHeader(idToken);
      const c = jose.decodeJwt(idToken);
      peek = JSON.stringify({ alg: h.alg, kid: String(h.kid ?? "").slice(0, 12) || null, iss: c.iss, aud_matches: c.aud === clientId || (Array.isArray(c.aud) && c.aud.includes(clientId)), expired: typeof c.exp === "number" ? c.exp * 1000 < Date.now() : null });
    } catch { /* keep "unreadable" */ }
    console.warn(JSON.stringify({ level: "warn", msg: "web3auth token rejected", reason: lastError instanceof Error ? lastError.message : "invalid", token: peek }));
    // The reason and the token's own claims are in the server log above; the caller is told only that the token was refused.
    throw new EngineError("INVALID_TOKEN", "The sign-in token was rejected. Sign in again.", 401);
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const wallets = Array.isArray(payload.wallets) ? (payload.wallets as { address?: unknown; public_key?: unknown }[]) : [];
  // An external wallet puts its address in `wallets`; newer tokens always carry a `wallet_address` claim as well.
  const walletAddress = str(wallets.find((w) => str(w.address))?.address) ?? str(payload.wallet_address);
  const connection = str(payload.authConnection);
  const providerId = str(payload.userId);
  const sub = str(payload.sub);
  const userId = providerId ?? sub;

  // Preferred id first (unchanged rules, so existing accounts keep matching), then every other id the token offers.
  const candidates: (string | null)[] = [];
  if (walletAddress && !connection) candidates.push(`wallet:${walletAddress.toLowerCase()}`);
  if (userId) candidates.push(`${connection ?? "w3a"}:${userId.toLowerCase()}`);
  if (walletAddress) candidates.push(`wallet:${walletAddress.toLowerCase()}`);
  if (sub) candidates.push(`w3a:${sub.toLowerCase()}`);
  const aliases = [...new Set(candidates.filter((c): c is string => !!c))];
  const subject = aliases[0];
  if (!subject) throw new EngineError("INVALID_TOKEN", `Web3Auth token carries no stable user id (claims: ${Object.keys(payload).join(", ")})`, 401);

  const email = str(payload.email)?.toLowerCase() ?? null;
  const hints = [connection, str(payload.groupedAuthConnectionId)].filter(Boolean).join(" ").toLowerCase().split(/[^a-z0-9]+/);
  const vouched = payload.email_verified === true || hints.some((w) => EMAIL_VERIFYING_WORDS.has(w));
  return { subject, aliases, email, name: str(payload.name), emailVerified: !!email && vouched, connection, issuedAt: typeof payload.iat === "number" ? payload.iat : null };
}

/** Verify an identity token with the configured client id (or the test override). */
export async function verifyIdentity(e: Engine, idToken: string): Promise<Web3AuthIdentity> {
  if (e.cfg.verifyIdentityToken) return e.cfg.verifyIdentityToken(idToken);
  if (!e.cfg.web3authClientId) throw new EngineError("NOT_CONFIGURED", "Web3Auth sign-in is not configured on this server", 503);
  return verifyWeb3AuthToken(idToken, e.cfg.web3authClientId);
}

/**
 * Sign in with a verified external identity, creating the merchant on first use.
 * An existing password account with the same email is never linked automatically: an identity provider's email is not a
 * proof of ownership we control, so the user must sign in with their password first.
 */
export async function signInWithIdentity(e: Engine, id: Web3AuthIdentity, input: { business_name?: string }, actor: Actor) {
  const provider = id.connection === "circle" ? "circle" : "web3auth";
  const aliases = id.aliases?.length ? id.aliases : [id.subject];
  const rows = await e.db.select().from(schema.externalIdentities).where(and(eq(schema.externalIdentities.provider, provider), inArray(schema.externalIdentities.subject, aliases)));
  // The first alias that is already linked decides who this is. If the aliases point at DIFFERENT accounts, nothing
  // is guessed and nothing is merged: the sign-in is refused until a person looks at it.
  const owners = new Set(rows.map((r) => r.userId));
  if (owners.size > 1) {
    e.log.error("sign-in token is linked to more than one account", { subjects: rows.map((r) => r.subject) });
    throw new EngineError("IDENTITY_CONFLICT", "This sign-in is linked to more than one account, so it cannot be used safely. Contact support.", 409);
  }
  const known = aliases.map((a) => rows.find((r) => r.subject === a)).find(Boolean);
  let userId = known?.userId;

  if (!userId) {
    const email = id.email ?? `${id.subject.replace(/[^a-z0-9]/g, "").slice(0, 48)}@sso.plinth.invalid`;
    const [taken] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email));
    if (taken) throw new EngineError("EMAIL_TAKEN", "An account with this email already exists. Sign in with your password instead.", 409);
    const merchantId = newId("mer");
    userId = newId("usr");
    const name = input.business_name?.trim() || id.name || (id.email ? id.email.split("@")[0]! : "My business");
    const created = userId;
    await e.db.transaction(async (tx) => {
      await tx.insert(schema.merchants).values({ id: merchantId, name });
      await tx.insert(schema.merchantUsers).values({ id: created, merchantId, email, passwordHash: await hashPassword(randomToken("nopw", 24)), role: "OWNER", emailVerifiedAt: id.emailVerified && id.email ? e.now() : null });
      for (const a of aliases) await tx.insert(schema.externalIdentities).values({ id: newId("ext"), userId: created, provider, subject: a, email: id.email }).onConflictDoNothing();
      await audit(tx, { merchantId, actor, action: "merchant.created", targetType: "merchant", targetId: merchantId, data: { via: provider } });
    });
  }
  if (userId) {
    // Remember every id this token offers, so the next token in a different shape still finds this account.
    // An id that already belongs to someone else is never moved: two accounts are never merged by a token.
    const linked = new Set(rows.map((r) => r.subject));
    for (const a of aliases) {
      if (linked.has(a)) continue;
      await e.db.insert(schema.externalIdentities).values({ id: newId("ext"), userId, provider, subject: a, email: id.email }).onConflictDoNothing();
    }
  }
  if (known && id.emailVerified && id.email) {
    // A returning user whose provider now vouches for the address we hold: mark it verified (never overwrite the address).
    await e.db.update(schema.merchantUsers).set({ emailVerifiedAt: e.now() }).where(and(eq(schema.merchantUsers.id, userId), eq(schema.merchantUsers.email, id.email), isNull(schema.merchantUsers.emailVerifiedAt)));
  }
  return startSession(e, userId, actor);
}
