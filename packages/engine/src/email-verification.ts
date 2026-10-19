import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, isNull, schema } from "@plinth/db";
import { newId } from "@plinth/shared";
import { audit } from "./audit";
import type { AuthContext } from "./auth";
import { EngineError, type Engine } from "./context";
import { sha256Hex, verifyPassword } from "./crypto";
import { emailChangedNotice, verifyEmailMessage } from "./email-templates";
import { verifyIdentity } from "./web3auth";

/** Wallet and social sign-ins without an email get a stand-in address on this reserved domain. It can never receive mail. */
export const PLACEHOLDER_EMAIL_SUFFIX = "@sso.plinth.invalid";
export const isPlaceholderEmail = (email: string) => email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);

const MAX_LINKS_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type User = typeof schema.merchantUsers.$inferSelect;

export async function userOf(e: Engine, ctx: AuthContext): Promise<User> {
  if (ctx.actor.type !== "USER" || !ctx.actor.id) throw new EngineError("SESSION_REQUIRED", "Sign in to the dashboard to do this", 403);
  const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, ctx.actor.id));
  if (!u) throw new EngineError("SESSION_REQUIRED", "Sign in to the dashboard to do this", 403);
  return u;
}

/**
 * Actions that decide where money goes (payout wallets, custody withdrawals, team changes) are refused to a team member who was
 * added only recently: the account's founder is always allowed, anyone else must have been on the team for the payout cooldown.
 * It gives the owners time to notice and remove a member who should not be there (for example one added with a stolen session).
 */
export async function requireSeasonedUser(e: Engine, ctx: AuthContext): Promise<User> {
  const u = await userOf(e, ctx);
  // The founder is the first user the account ever had (a removed member keeps its row, so this cannot be passed to a newcomer).
  const [first] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.merchantId, u.merchantId)).orderBy(asc(schema.merchantUsers.createdAt)).limit(1);
  const founder = first?.id === u.id;
  const age = e.now().getTime() - u.createdAt.getTime();
  if (!founder && age < e.cfg.payoutCooldownSeconds * 1000) {
    throw new EngineError("MEMBER_TOO_NEW", "This team member was added recently. Money-related changes unlock once they have been on the team for the payout waiting period.", 403);
  }
  return u;
}

export interface EmailStatus {
  /** The real address, or null when the account only has a stand-in (wallet or social sign-in without an email). */
  email: string | null;
  verified: boolean;
  /** Sign-in method: "password" or "identity" (Web3Auth). Decides how re-authentication works. */
  auth_method: "password" | "identity";
  email_available: boolean;
}

export async function emailStatus(e: Engine, ctx: AuthContext): Promise<EmailStatus> {
  const u = await userOf(e, ctx);
  const [ext] = await e.db.select({ id: schema.externalIdentities.id }).from(schema.externalIdentities).where(eq(schema.externalIdentities.userId, u.id)).limit(1);
  const real = !isPlaceholderEmail(u.email);
  return { email: real ? u.email : null, verified: real && !!u.emailVerifiedAt, auth_method: ext ? "identity" : "password", email_available: e.email.available };
}

/** Throws unless the signed-in user has a real, verified email. Used before anything that needs a second factor by email. */
export async function requireVerifiedEmail(e: Engine, ctx: AuthContext): Promise<User> {
  const u = await userOf(e, ctx);
  if (isPlaceholderEmail(u.email)) throw new EngineError("EMAIL_REQUIRED", "Add and verify an email address first. It is how Plinth confirms changes that affect where your money goes.", 403);
  if (!u.emailVerifiedAt) throw new EngineError("EMAIL_NOT_VERIFIED", "Verify your email address first. We sent a link when you signed up; you can send another from Settings.", 403);
  return u;
}

// ------------------------------------------------------------------ re-authentication

/** Wrong re-authentication passwords per user (this process). A stolen session must not be able to guess the password offline of the API's own limits. */
const REAUTH_MAX_FAILURES = 8;
const REAUTH_WINDOW_MS = 15 * 60_000;
const reauthFailures = new Map<string, number[]>();
const recentReauthFailures = (userId: string, now: number) => {
  const list = (reauthFailures.get(userId) ?? []).filter((t) => now - t < REAUTH_WINDOW_MS);
  if (list.length) reauthFailures.set(userId, list);
  else reauthFailures.delete(userId);
  return list;
};

export interface Reauth {
  /** Email accounts: the current password. */
  password?: string;
  /** Wallet and social accounts: an identity token from a sign-in completed within the re-auth window. */
  id_token?: string;
}

/**
 * Prove the person at the keyboard is the account owner right now, not just someone holding a session token.
 * Password accounts re-enter the password; Web3Auth accounts must sign in again (the identity token has to be
 * fresh and belong to the same linked identity).
 */
export async function verifyReauth(e: Engine, ctx: AuthContext, reauth: Reauth | undefined): Promise<User> {
  const u = await userOf(e, ctx);
  const identities = await e.db.select().from(schema.externalIdentities).where(eq(schema.externalIdentities.userId, u.id));
  if (identities.length > 0) {
    if (!reauth?.id_token) throw new EngineError("REAUTH_REQUIRED", "Sign in again to confirm this change.", 403);
    let identity;
    try {
      identity = await verifyIdentity(e, reauth.id_token);
    } catch {
      throw new EngineError("REAUTH_FAILED", "That sign-in could not be verified. Try again.", 403);
    }
    const offered = new Set(identity.aliases?.length ? identity.aliases : [identity.subject]);
    if (!identities.some((i) => offered.has(i.subject))) throw new EngineError("REAUTH_FAILED", "That sign-in belongs to a different account.", 403);
    const age = identity.issuedAt === null ? Infinity : e.now().getTime() / 1000 - identity.issuedAt;
    if (age > e.cfg.reauthWindowSeconds || age < -120) throw new EngineError("REAUTH_REQUIRED", "That sign-in is too old. Sign in again to confirm this change.", 403);
    return u;
  }
  if (!reauth?.password) throw new EngineError("REAUTH_REQUIRED", "Enter your password to confirm this change.", 403);
  const now = e.now().getTime();
  const recent = recentReauthFailures(u.id, now);
  if (recent.length >= REAUTH_MAX_FAILURES) throw new EngineError("TOO_MANY_ATTEMPTS", "Too many wrong passwords. Try again in a few minutes.", 429);
  if (!(await verifyPassword(reauth.password, u.passwordHash))) {
    reauthFailures.set(u.id, [...recent, now]);
    throw new EngineError("REAUTH_FAILED", "The password is not correct.", 403);
  }
  reauthFailures.delete(u.id);
  return u;
}

// ------------------------------------------------------------------ emailed links

async function issueLink(e: Engine, u: User, email: string, purpose: "VERIFY" | "CHANGE") {
  if (!e.email.available) throw new EngineError("EMAIL_UNAVAILABLE", "Email is not configured on this server.", 503);
  const since = new Date(e.now().getTime() - 3_600_000);
  const [{ n } = { n: 0 }] = await e.db.select({ n: count() }).from(schema.emailVerifications).where(and(eq(schema.emailVerifications.userId, u.id), gt(schema.emailVerifications.createdAt, since)));
  if (n >= MAX_LINKS_PER_HOUR) throw new EngineError("TOO_MANY_EMAILS", "Too many emails were requested. Try again in an hour.", 429);

  const token = randomBytes(32).toString("base64url");
  const id = newId("evt");
  const link = `${e.cfg.publicWebUrl.replace(/\/$/, "")}/verify-email?token=${token}`;
  await e.db.insert(schema.emailVerifications).values({
    id, userId: u.id, email, purpose, tokenHash: sha256Hex(token), expiresAt: new Date(e.now().getTime() + e.cfg.emailLinkTtlSeconds * 1000),
  });
  await e.email.send(verifyEmailMessage(email, link, Math.round(e.cfg.emailLinkTtlSeconds / 3600), `verify:${id}`));
  return { id };
}

/** Send a link to the address the account already has. */
export async function requestEmailVerification(e: Engine, ctx: AuthContext) {
  const u = await userOf(e, ctx);
  if (isPlaceholderEmail(u.email)) throw new EngineError("EMAIL_REQUIRED", "This account has no email address yet. Add one first.", 409);
  if (u.emailVerifiedAt) return { status: "already_verified" as const, email: u.email };
  await issueLink(e, u, u.email, "VERIFY");
  await audit(e.db, { merchantId: ctx.merchantId, actor: ctx.actor, action: "email.verification_sent", targetType: "user", targetId: u.id });
  return { status: "sent" as const, email: u.email };
}

/**
 * Add or replace the account's email. Needs a fresh sign-in: a stolen dashboard session must not be able to point
 * confirmation emails at an attacker's inbox. The change only happens when the new address is proven by its link.
 */
export async function requestEmailChange(e: Engine, ctx: AuthContext, input: { email: string; reauth?: Reauth }) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 320 || isPlaceholderEmail(email)) throw new EngineError("INVALID_EMAIL", "Enter a valid email address.", 400);
  const u = await verifyReauth(e, ctx, input.reauth);
  if (email === u.email.toLowerCase()) return requestEmailVerification(e, ctx);
  const [taken] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email));
  if (taken) throw new EngineError("EMAIL_TAKEN", "An account with this email already exists.", 409);
  await issueLink(e, u, email, "CHANGE");
  await audit(e.db, { merchantId: ctx.merchantId, actor: ctx.actor, action: "email.change_requested", targetType: "user", targetId: u.id, data: { to: email } });
  return { status: "sent" as const, email };
}

/** Public: the link in the email. Single use. Works without a session on purpose (people open email on another device). */
export async function confirmEmailLink(e: Engine, token: string) {
  const [row] = await e.db.select().from(schema.emailVerifications).where(eq(schema.emailVerifications.tokenHash, sha256Hex(token)));
  if (!row || row.usedAt || row.expiresAt.getTime() < e.now().getTime()) throw new EngineError("LINK_INVALID", "This link is no longer valid. Request a new one from Settings.", 410);
  const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, row.userId));
  if (!u) throw new EngineError("LINK_INVALID", "This link is no longer valid.", 410);

  const previous = u.email;
  let notifyOld: string | null = null;
  await e.db.transaction(async (tx) => {
    const claimed = await tx.update(schema.emailVerifications).set({ usedAt: e.now() }).where(and(eq(schema.emailVerifications.id, row.id), isNull(schema.emailVerifications.usedAt))).returning({ id: schema.emailVerifications.id });
    if (claimed.length === 0) throw new EngineError("LINK_INVALID", "This link was already used.", 410);
    if (row.purpose === "VERIFY") {
      if (u.email.toLowerCase() !== row.email.toLowerCase()) throw new EngineError("LINK_INVALID", "This link is for an address that is no longer on the account.", 410);
      await tx.update(schema.merchantUsers).set({ emailVerifiedAt: e.now() }).where(eq(schema.merchantUsers.id, u.id));
    } else {
      const [taken] = await tx.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, row.email));
      if (taken && taken.id !== u.id) throw new EngineError("EMAIL_TAKEN", "An account with this email already exists.", 409);
      await tx.update(schema.merchantUsers).set({ email: row.email, emailVerifiedAt: e.now() }).where(eq(schema.merchantUsers.id, u.id));
      if (!isPlaceholderEmail(previous) && u.emailVerifiedAt) notifyOld = previous;
    }
    await audit(tx, { merchantId: u.merchantId, actor: { type: "USER", id: u.id }, action: row.purpose === "VERIFY" ? "email.verified" : "email.changed", targetType: "user", targetId: u.id, data: { email: row.email } });
  });
  if (notifyOld) await e.email.send(emailChangedNotice(notifyOld, row.email)).catch((err) => e.log.warn("could not notify the previous email address", { err: String(err).slice(0, 120) }));
  return { email: row.email, purpose: row.purpose as "VERIFY" | "CHANGE" };
}
