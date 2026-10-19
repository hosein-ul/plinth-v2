import { and, eq, schema } from "@plinth/db";
import { newId, randomToken } from "@plinth/shared";
import { audit } from "./audit";
import { REMOVED_EMAIL_SUFFIX, requirePermission, type AuthContext, type Role } from "./auth";
import { EngineError, type Engine } from "./context";
import { hashPassword } from "./crypto";
import { requireSeasonedUser, verifyReauth, type Reauth } from "./email-verification";
import { teamChangeNotice } from "./email-templates";
import { notify } from "./payout-config";

/**
 * Team changes decide who can later move money, so they are held to the same bar as a payout change: a fresh sign-in by the person
 * making the change (a stolen session alone is not enough), a member who has been on the team long enough, and a notice to
 * every owner and admin who has a verified address.
 */

async function ownerCount(e: Engine, merchantId: string): Promise<number> {
  const rows = await e.db.select({ id: schema.merchantUsers.id, email: schema.merchantUsers.email }).from(schema.merchantUsers).where(and(eq(schema.merchantUsers.merchantId, merchantId), eq(schema.merchantUsers.role, "OWNER")));
  return rows.filter((r) => !r.email.endsWith(REMOVED_EMAIL_SUFFIX)).length;
}

export async function addTeamMember(e: Engine, ctx: AuthContext, input: { email: string; role: Role; reauth?: Reauth }) {
  requirePermission(ctx, "team");
  if (input.role === "OWNER" && ctx.role !== "OWNER") throw new EngineError("FORBIDDEN", "Only an owner can add another owner", 403);
  await requireSeasonedUser(e, ctx);
  await verifyReauth(e, ctx, input.reauth);
  const email = input.email.trim().toLowerCase();
  const [dup] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email));
  if (dup) throw new EngineError("EMAIL_TAKEN", "A user with this email already exists", 409);
  const temp = randomToken("tmp", 12);
  const id = newId("usr");
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.merchantUsers).values({ id, merchantId: ctx.merchantId, email, passwordHash: await hashPassword(temp), role: input.role });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "team.member_added", targetType: "user", targetId: id, data: { email, role: input.role } });
  });
  await notify(e, ctx.merchantId, (to) => teamChangeNotice(to, { event: "added", member: email, role: input.role }));
  return { id, email, role: input.role, temporary_password: temp };
}

export async function setMemberRole(e: Engine, ctx: AuthContext, userId: string, role: Role, reauth?: Reauth) {
  requirePermission(ctx, "team");
  await requireSeasonedUser(e, ctx);
  const [u] = await e.db.select().from(schema.merchantUsers).where(and(eq(schema.merchantUsers.id, userId), eq(schema.merchantUsers.merchantId, ctx.merchantId)));
  if (!u || u.email.endsWith(REMOVED_EMAIL_SUFFIX)) throw new EngineError("NOT_FOUND", "User not found", 404);
  if ((u.role === "OWNER" || role === "OWNER") && ctx.role !== "OWNER") throw new EngineError("FORBIDDEN", "Only an owner can change owner roles", 403);
  await verifyReauth(e, ctx, reauth);
  if (u.role === "OWNER" && role !== "OWNER" && (await ownerCount(e, ctx.merchantId)) <= 1) throw new EngineError("LAST_OWNER", "A merchant must keep at least one owner", 409);
  await e.db.transaction(async (tx) => {
    await tx.update(schema.merchantUsers).set({ role }).where(eq(schema.merchantUsers.id, userId));
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "team.role_changed", targetType: "user", targetId: userId, data: { from: u.role, to: role } });
  });
  await notify(e, ctx.merchantId, (to) => teamChangeNotice(to, { event: "role_changed", member: u.email, role }));
}

/** Remove a member: their sessions end at once and they can no longer sign in. The row stays (history points at it). */
export async function removeTeamMember(e: Engine, ctx: AuthContext, userId: string, reauth?: Reauth) {
  requirePermission(ctx, "team");
  await requireSeasonedUser(e, ctx);
  const [u] = await e.db.select().from(schema.merchantUsers).where(and(eq(schema.merchantUsers.id, userId), eq(schema.merchantUsers.merchantId, ctx.merchantId)));
  if (!u || u.email.endsWith(REMOVED_EMAIL_SUFFIX)) throw new EngineError("NOT_FOUND", "User not found", 404);
  if (u.id === ctx.actor.id) throw new EngineError("INVALID_STATE", "You cannot remove yourself", 409);
  if (u.role === "OWNER" && ctx.role !== "OWNER") throw new EngineError("FORBIDDEN", "Only an owner can remove an owner", 403);
  await verifyReauth(e, ctx, reauth);
  if (u.role === "OWNER" && (await ownerCount(e, ctx.merchantId)) <= 1) throw new EngineError("LAST_OWNER", "A merchant must keep at least one owner", 409);
  await e.db.transaction(async (tx) => {
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
    await tx.delete(schema.externalIdentities).where(eq(schema.externalIdentities.userId, u.id));
    await tx.update(schema.merchantUsers).set({ email: `${u.id}${REMOVED_EMAIL_SUFFIX}`, passwordHash: "removed", role: "VIEWER", emailVerifiedAt: null }).where(eq(schema.merchantUsers.id, u.id));
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "team.member_removed", targetType: "user", targetId: u.id, data: { email: u.email, role: u.role } });
  });
  await notify(e, ctx.merchantId, (to) => teamChangeNotice(to, { event: "removed", member: u.email, role: u.role }));
  return { id: u.id, removed: true };
}

