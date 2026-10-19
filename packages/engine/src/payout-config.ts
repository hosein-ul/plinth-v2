import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, inArray, isNull, schema, type Executor } from "@plinth/db";
import { formatFeePercent, newId } from "@plinth/shared";
import { getAddress, isAddress, isAddressEqual, recoverMessageAddress, zeroAddress, type Address, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { audit } from "./audit";
import { requirePermission, type AuthContext } from "./auth";
import { chainOf, EngineError, norm, type ChainRuntime, type Engine } from "./context";
import { sha256Hex } from "./crypto";
import { requireSeasonedUser, requireVerifiedEmail, verifyReauth, userOf, type Reauth } from "./email-verification";
import { payoutChangedNotice, payoutConfirmMessage, type PayoutChangeDetails } from "./email-templates";
import { activePayoutConfig, feeBpsFor, PROOF_STATEMENT } from "./payout-route";
import { emitEvent } from "./webhooks";

const CHALLENGE_TTL_MS = 10 * 60_000;
const MAX_CHALLENGES_PER_HOUR = 20;

type Config = typeof schema.merchantPayoutConfigs.$inferSelect;
export type ProofPurpose = "PAYOUT_WALLET" | "VAULT_OWNER" | "CUSTODY_WITHDRAWAL";
export type PayoutMode = "VAULT" | "DIRECT" | "CUSTODIAL";

// ------------------------------------------------------------------ proof of wallet control (EIP-4361)

/**
 * Issue the message a wallet must sign to prove it controls an address. It is a standard Sign-In with Ethereum
 * (EIP-4361) message: domain, address, chain, a random single-use nonce, a ten-minute expiry, and a statement that
 * says what the signature is for. The exact text is stored; the signature is checked against THAT text.
 */
export async function createPayoutChallenge(e: Engine, ctx: AuthContext, input: { network: string; address: string; purpose: ProofPurpose }) {
  requirePermission(ctx, "wallets");
  await userOf(e, ctx);
  const chain = chainOf(e, input.network);
  if (!isAddress(input.address)) throw new EngineError("INVALID_ADDRESS", "That is not a valid wallet address.", 400);
  const address = getAddress(input.address);
  assertUsableWalletAddress(chain, address);

  const since = new Date(e.now().getTime() - 3_600_000);
  const [{ n } = { n: 0 }] = await e.db.select({ n: count() }).from(schema.payoutChallenges).where(and(eq(schema.payoutChallenges.merchantId, ctx.merchantId), gt(schema.payoutChallenges.createdAt, since)));
  if (n >= MAX_CHALLENGES_PER_HOUR) throw new EngineError("TOO_MANY_REQUESTS", "Too many signing requests. Try again later.", 429);

  const origin = new URL(e.cfg.publicWebUrl);
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = e.now();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  if (input.purpose === "CUSTODY_WITHDRAWAL" && !(e.cfg.custodyEnabled && chain.custody)) throw new EngineError("CUSTODY_UNAVAILABLE", "Custodial payouts are not available on this network.", 409);
  const what = input.purpose === "PAYOUT_WALLET" ? PROOF_STATEMENT.DIRECT : input.purpose === "CUSTODY_WITHDRAWAL" ? PROOF_STATEMENT.CUSTODIAL : "own your Plinth vault";
  const message = createSiweMessage({
    address,
    chainId: chain.network.chainId,
    domain: origin.host,
    nonce,
    uri: origin.origin,
    version: "1",
    statement: `Confirm that this wallet may ${what} on ${chain.network.name} for Plinth merchant ${ctx.merchantId}. This signature does not send a transaction or move funds.`,
    requestId: ctx.merchantId,
    issuedAt,
    expirationTime: expiresAt,
  });
  await e.db.insert(schema.payoutChallenges).values({ nonce, merchantId: ctx.merchantId, networkId: input.network, address: norm(address), purpose: input.purpose, message, expiresAt });
  return { nonce, message, expires_at: expiresAt.toISOString(), address, network: input.network, purpose: input.purpose };
}

function assertUsableWalletAddress(chain: ChainRuntime, address: Address) {
  const d = chain.deployment;
  // Never a payout wallet: the treasury, any payment token, and every contract of every token's set.
  const sets = [...chain.tokens.values()].flatMap((t) => [t.config.address, t.contracts.vaultFactory, t.contracts.invoiceFactory, t.contracts.invoiceImplementation, t.contracts.paymentRouter]);
  // The custody wallet and the relayer are platform keys: a merchant can never name one as a destination or withdrawal wallet.
  const refused = [zeroAddress, d.treasury, ...(chain.custody ? [chain.custody.address] : []), ...(chain.signer ? [chain.signer.address] : []), ...sets];
  if (refused.some((x) => isAddressEqual(x, address))) throw new EngineError("INVALID_ADDRESS", "That address cannot be used as a payout wallet.", 400);
}

/** The proof must be a fresh, unused challenge for exactly this merchant, network, address and purpose, signed by that address. */
async function checkProof(e: Engine, ctx: AuthContext, input: { network: string; address: Address; purpose: ProofPurpose; nonce: string; signature: string }) {
  const reject = async (why: string) => {
    await audit(e.db, { merchantId: ctx.merchantId, actor: ctx.actor, action: "payout.proof_rejected", targetType: "network", targetId: input.network, data: { why, purpose: input.purpose } });
    throw new EngineError("PROOF_INVALID", "The wallet signature could not be verified. Start again and sign the new message.", 422);
  };
  const [ch] = await e.db.select().from(schema.payoutChallenges).where(eq(schema.payoutChallenges.nonce, input.nonce));
  if (!ch || ch.merchantId !== ctx.merchantId || ch.networkId !== input.network || ch.purpose !== input.purpose || ch.address !== norm(input.address)) return reject("unknown challenge");
  if (ch.usedAt) return reject("challenge already used");
  if (ch.expiresAt.getTime() < e.now().getTime()) return reject("challenge expired");
  let signer: Address;
  try {
    signer = await recoverMessageAddress({ message: ch.message, signature: input.signature as Hex });
  } catch {
    return reject("malformed signature");
  }
  if (!isAddressEqual(signer, input.address)) return reject("signed by a different address");
  return ch;
}

/** Plain accounts only: a contract (Safe, smart account) or a delegated account is not accepted in this version. */
async function assertExternallyOwnedAccount(chain: ChainRuntime, address: Address) {
  const code = (await chain.client.getCode({ address }).catch(() => undefined)) ?? "0x";
  if (code !== "0x") throw new EngineError("NOT_A_PLAIN_WALLET", "This version supports plain wallets (EOAs) only. Smart-contract wallets such as Safe are not supported yet.", 422);
}

async function assertNotBlacklisted(chain: ChainRuntime, address: Address) {
  // The wallet will receive every token the network accepts, so a block on any of them matters.
  for (const t of chain.tokens.values()) {
    if ((await t.adapter.isBlacklisted(address)) === true) throw new EngineError("ADDRESS_BLOCKED", `The ${t.symbol} issuer has blocked this address, so it cannot receive ${t.symbol}.`, 422);
  }
}

/** Used by vault creation: the owner must prove control of the address that will own the vault. */
export async function verifyVaultOwnerProof(e: Engine, ctx: AuthContext, input: { network: string; owner: Address; proof?: { nonce: string; signature: string } }): Promise<{ nonce: string } | null> {
  if (!input.proof) {
    if (e.cfg.requireVaultOwnerProof) throw new EngineError("OWNER_PROOF_REQUIRED", "Sign a message with the owner wallet to prove you control it before the vault is created.", 422);
    return null;
  }
  const chain = chainOf(e, input.network);
  await assertExternallyOwnedAccount(chain, input.owner);
  const ch = await checkProof(e, ctx, { network: input.network, address: input.owner, purpose: "VAULT_OWNER", nonce: input.proof.nonce, signature: input.proof.signature });
  return { nonce: ch.nonce };
}

/** Mark a challenge used, atomically: a replayed signature finds it already used. */
export async function consumeChallenge(e: Engine, tx: Executor, nonce: string): Promise<void> {
  const claimed = await tx.update(schema.payoutChallenges).set({ usedAt: e.now() }).where(and(eq(schema.payoutChallenges.nonce, nonce), isNull(schema.payoutChallenges.usedAt))).returning({ n: schema.payoutChallenges.nonce });
  if (claimed.length === 0) throw new EngineError("PROOF_INVALID", "This signature was already used. Start again and sign the new message.", 422);
}

// ------------------------------------------------------------------ requesting a payout wallet

const envOf = (chain: ChainRuntime) => (chain.network.environment === "mainnet" ? "live" : "test");

async function emitPayoutEvent(e: Engine, ctx: { merchantId: string }, chain: ChainRuntime, type: "payout.requested" | "payout.confirmed" | "payout.switched_to_vault" | "payout.cancelled", extra: Record<string, unknown>, key: string) {
  await e.db.transaction((tx) => emitEvent(e, tx, { merchantId: ctx.merchantId, environment: envOf(chain), type, dedupeKey: `${type}:${key}`, extra: { payout: extra } }));
}

/** Tell every owner/admin who has a verified address. Best effort: a mail problem must never undo or block the change. */
export async function notify(e: Engine, merchantId: string, make: (to: string) => import("./email").EmailMessage) {
  const users = await e.db.select().from(schema.merchantUsers).where(and(eq(schema.merchantUsers.merchantId, merchantId), inArray(schema.merchantUsers.role, ["OWNER", "ADMIN"])));
  for (const u of users) {
    if (!u.emailVerifiedAt || u.email.endsWith("@sso.plinth.invalid")) continue;
    await e.email.send(make(u.email)).catch((err) => e.log.warn("payout notice not delivered", { merchantId, err: String(err).slice(0, 120) }));
  }
}

const cooldownHours = (e: Engine) => Math.round((e.cfg.payoutCooldownSeconds / 3600) * 10) / 10;

export async function requestPayoutWallet(e: Engine, ctx: AuthContext, input: { network: string; mode?: "DIRECT" | "CUSTODIAL"; address: string; nonce: string; signature: string; reauth?: Reauth }) {
  requirePermission(ctx, "wallets");
  await requireSeasonedUser(e, ctx);
  const emailRequired = e.cfg.requireEmailConfirmation;
  const user = emailRequired ? await requireVerifiedEmail(e, ctx) : await userOf(e, ctx); // with email confirmation on, a second factor by email must exist
  await verifyReauth(e, ctx, input.reauth);
  const chain = chainOf(e, input.network);
  const mode = input.mode ?? "DIRECT";
  if (mode === "CUSTODIAL" && !(e.cfg.custodyEnabled && chain.custody)) throw new EngineError("CUSTODY_UNAVAILABLE", "Custodial payouts are not available on this network.", 409);
  if (!isAddress(input.address)) throw new EngineError("INVALID_ADDRESS", "That is not a valid wallet address.", 400);
  const address = getAddress(input.address);
  assertUsableWalletAddress(chain, address);
  await assertExternallyOwnedAccount(chain, address);
  await assertNotBlacklisted(chain, address);

  const active = await activePayoutConfig(e, e.db, ctx.merchantId, input.network);
  if (active?.mode === mode && active.address && isAddressEqual(active.address as Address, address)) throw new EngineError("ALREADY_ACTIVE", mode === "CUSTODIAL" ? "Custodial payouts on this network already use that withdrawal wallet." : "New payments on this network already go to that wallet.", 409);

  const ch = await checkProof(e, ctx, { network: input.network, address, purpose: mode === "CUSTODIAL" ? "CUSTODY_WITHDRAWAL" : "PAYOUT_WALLET", nonce: input.nonce, signature: input.signature });
  const id = newId("pco");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(e.now().getTime() + e.cfg.emailLinkTtlSeconds * 1000);
  if (emailRequired && !e.email.available) throw new EngineError("EMAIL_UNAVAILABLE", "Email is not configured on this server, so a payout wallet cannot be confirmed.", 503);
  const auto = !emailRequired;
  const now = e.now();

  await e.db.transaction(async (tx) => {
    await consumeChallenge(e, tx, ch.nonce);
    // A newer request replaces any earlier one that was still waiting for its email link.
    await tx.update(schema.merchantPayoutConfigs).set({ status: "SUPERSEDED", confirmationTokenHash: null }).where(and(eq(schema.merchantPayoutConfigs.merchantId, ctx.merchantId), eq(schema.merchantPayoutConfigs.networkId, input.network), eq(schema.merchantPayoutConfigs.status, "PENDING_CONFIRMATION")));
    await tx.insert(schema.merchantPayoutConfigs).values({
      id, merchantId: ctx.merchantId, networkId: input.network, mode, address: norm(address), status: auto ? "CONFIRMED" : "PENDING_CONFIRMATION",
      proofMessage: ch.message, proofSignature: input.signature, proofSignedAt: now, requestedByUserId: user.id,
      ...(auto ? { confirmedAt: now, activeFrom: new Date(now.getTime() + e.cfg.payoutCooldownSeconds * 1000) } : { confirmationTokenHash: sha256Hex(token), confirmationExpiresAt: expiresAt }),
    });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "payout.requested", targetType: "merchant_payout_config", targetId: id, data: { network: input.network, mode, address } });
  });

  const details: PayoutChangeDetails = { network: chain.network.name, mode, address, cooldownHours: cooldownHours(e) };
  if (auto) {
    // No email step: the proof, the fresh sign-in and the cooldown already stand. Tell the owners if they have an address.
    await notify(e, ctx.merchantId, (to) => payoutChangedNotice(to, { ...details, event: "confirmed" }));
    await emitPayoutEvent(e, ctx, chain, "payout.confirmed", { id, network: input.network, mode, address, active_from: (await e.db.select().from(schema.merchantPayoutConfigs).where(eq(schema.merchantPayoutConfigs.id, id)))[0]!.activeFrom?.toISOString() ?? null }, id);
    return viewNow(e, (await e.db.select().from(schema.merchantPayoutConfigs).where(eq(schema.merchantPayoutConfigs.id, id)))[0]!);
  }
  const link = `${e.cfg.publicWebUrl.replace(/\/$/, "")}/confirm-payout?token=${token}`;
  try {
    await e.email.send(payoutConfirmMessage(user.email, link, details, Math.round(e.cfg.emailLinkTtlSeconds / 3600), `payout:${id}`));
  } catch (err) {
    await e.db.update(schema.merchantPayoutConfigs).set({ status: "CANCELLED", confirmationTokenHash: null }).where(eq(schema.merchantPayoutConfigs.id, id));
    throw err;
  }
  await emitPayoutEvent(e, ctx, chain, "payout.requested", { id, network: input.network, mode, address }, id);
  return viewNow(e, (await e.db.select().from(schema.merchantPayoutConfigs).where(eq(schema.merchantPayoutConfigs.id, id)))[0]!);
}

/** Public: the link in the confirmation email. Single use; starts the cooldown. */
export async function confirmPayoutLink(e: Engine, token: string) {
  const [row] = await e.db.select().from(schema.merchantPayoutConfigs).where(eq(schema.merchantPayoutConfigs.confirmationTokenHash, sha256Hex(token)));
  if (!row || row.status !== "PENDING_CONFIRMATION") throw new EngineError("LINK_INVALID", "This link is no longer valid. Start the change again from the dashboard.", 410);
  if (!row.confirmationExpiresAt || row.confirmationExpiresAt.getTime() < e.now().getTime()) {
    await e.db.update(schema.merchantPayoutConfigs).set({ status: "EXPIRED", confirmationTokenHash: null }).where(eq(schema.merchantPayoutConfigs.id, row.id));
    throw new EngineError("LINK_INVALID", "This link expired. Start the change again from the dashboard.", 410);
  }
  const chain = chainOf(e, row.networkId);
  const now = e.now();
  const activeFrom = new Date(now.getTime() + e.cfg.payoutCooldownSeconds * 1000);
  const done = await e.db.transaction(async (tx) => {
    const claimed = await tx.update(schema.merchantPayoutConfigs).set({ status: "CONFIRMED", confirmedAt: now, activeFrom, confirmationTokenHash: null }).where(and(eq(schema.merchantPayoutConfigs.id, row.id), eq(schema.merchantPayoutConfigs.status, "PENDING_CONFIRMATION"))).returning();
    if (claimed.length === 0) throw new EngineError("LINK_INVALID", "This link was already used.", 410);
    await audit(tx, { merchantId: row.merchantId, actor: { type: "USER", id: row.requestedByUserId ?? undefined }, action: "payout.confirmed", targetType: "merchant_payout_config", targetId: row.id, data: { network: row.networkId, mode: row.mode, address: row.address, active_from: activeFrom.toISOString(), via: "email_link" } });
    return claimed[0]!;
  });
  const details: PayoutChangeDetails = { network: chain.network.name, mode: done.mode as PayoutMode, address: done.address, cooldownHours: cooldownHours(e) };
  await notify(e, row.merchantId, (to) => payoutChangedNotice(to, { ...details, event: "confirmed" }));
  await emitPayoutEvent(e, { merchantId: row.merchantId }, chain, "payout.confirmed", { id: row.id, network: row.networkId, mode: row.mode, address: row.address, active_from: activeFrom.toISOString() }, row.id);
  return viewNow(e, done);
}

/** Go back to paying into the merchant's vault. The safe direction: it applies at once, but still needs a fresh sign-in and is announced. */
export async function switchToVault(e: Engine, ctx: AuthContext, input: { network: string; reauth?: Reauth }) {
  requirePermission(ctx, "wallets");
  await verifyReauth(e, ctx, input.reauth);
  const chain = chainOf(e, input.network);
  const [vault] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, ctx.merchantId), eq(schema.merchantVaults.networkId, input.network), eq(schema.merchantVaults.status, "ACTIVE")));
  if (!vault) throw new EngineError("VAULT_REQUIRED", "There is no active vault on this network to pay into. Create one first.", 409);
  const active = await activePayoutConfig(e, e.db, ctx.merchantId, input.network);
  if (!active || active.mode === "VAULT") {
    const mine = await e.db.select().from(schema.merchantPayoutConfigs).where(and(eq(schema.merchantPayoutConfigs.merchantId, ctx.merchantId), eq(schema.merchantPayoutConfigs.networkId, input.network), inArray(schema.merchantPayoutConfigs.mode, ["DIRECT", "CUSTODIAL"])));
    const inFlight = mine.some((r) => r.status === "PENDING_CONFIRMATION" || (r.status === "CONFIRMED" && !!r.activeFrom && r.activeFrom.getTime() > e.now().getTime()));
    if (!inFlight) throw new EngineError("ALREADY_ACTIVE", "New payments on this network already go to your vault.", 409);
  }
  const id = newId("pco");
  const now = e.now();
  const row = await e.db.transaction(async (tx) => {
    // Anything waiting for an email link is cancelled; a wallet still in its cooldown loses to this newer choice.
    await tx.update(schema.merchantPayoutConfigs).set({ status: "CANCELLED", confirmationTokenHash: null }).where(and(eq(schema.merchantPayoutConfigs.merchantId, ctx.merchantId), eq(schema.merchantPayoutConfigs.networkId, input.network), eq(schema.merchantPayoutConfigs.status, "PENDING_CONFIRMATION")));
    const [r] = await tx.insert(schema.merchantPayoutConfigs).values({ id, merchantId: ctx.merchantId, networkId: input.network, mode: "VAULT", address: null, status: "CONFIRMED", requestedByUserId: ctx.actor.id ?? null, confirmedAt: now, activeFrom: now }).returning();
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "payout.switched_to_vault", targetType: "merchant_payout_config", targetId: id, data: { network: input.network, vault: vault.vaultAddress } });
    return r!;
  });
  const details: PayoutChangeDetails = { network: chain.network.name, mode: "VAULT", address: null, cooldownHours: 0 };
  await notify(e, ctx.merchantId, (to) => payoutChangedNotice(to, { ...details, event: "switched_to_vault" }));
  await emitPayoutEvent(e, ctx, chain, "payout.switched_to_vault", { id, network: input.network, mode: "VAULT" }, id);
  return viewNow(e, row);
}

/** Cancel a request still waiting for its email link, or a confirmed wallet still in its cooldown. */
export async function cancelPendingPayout(e: Engine, ctx: AuthContext, input: { id: string }) {
  requirePermission(ctx, "wallets");
  await userOf(e, ctx);
  const [row] = await e.db.select().from(schema.merchantPayoutConfigs).where(and(eq(schema.merchantPayoutConfigs.id, input.id), eq(schema.merchantPayoutConfigs.merchantId, ctx.merchantId)));
  if (!row) throw new EngineError("NOT_FOUND", "Payout request not found", 404);
  const cooling = row.status === "CONFIRMED" && !!row.activeFrom && row.activeFrom.getTime() > e.now().getTime();
  if (row.status !== "PENDING_CONFIRMATION" && !cooling) throw new EngineError("INVALID_STATE", "Only a pending change, or a wallet that has not started applying yet, can be cancelled.", 409);
  const chain = chainOf(e, row.networkId);
  const [done] = await e.db.transaction(async (tx) => {
    const r = await tx.update(schema.merchantPayoutConfigs).set({ status: "CANCELLED", confirmationTokenHash: null }).where(eq(schema.merchantPayoutConfigs.id, row.id)).returning();
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "payout.cancelled", targetType: "merchant_payout_config", targetId: row.id, data: { network: row.networkId } });
    return r;
  });
  const details: PayoutChangeDetails = { network: chain.network.name, mode: row.mode as PayoutMode, address: row.address, cooldownHours: 0 };
  await notify(e, ctx.merchantId, (to) => payoutChangedNotice(to, { ...details, event: "cancelled" }));
  await emitPayoutEvent(e, ctx, chain, "payout.cancelled", { id: row.id, network: row.networkId }, row.id);
  return viewNow(e, done!);
}

// ------------------------------------------------------------------ reading

type Status = "ACTIVE" | "COOLING_DOWN" | "PENDING_CONFIRMATION" | "SUPERSEDED" | "CANCELLED" | "EXPIRED" | "DISABLED";

/** What a stored row means right now: a confirmed wallet is "cooling down" until its start time, then "active" if it is the one in use. */
function statusOf(e: Engine, row: Config, activeId: string | null): Status {
  if (row.status === "CONFIRMED") {
    if (row.activeFrom && row.activeFrom.getTime() > e.now().getTime()) return "COOLING_DOWN";
    return row.id === activeId ? "ACTIVE" : "SUPERSEDED";
  }
  if (row.status === "PENDING_CONFIRMATION" && row.confirmationExpiresAt && row.confirmationExpiresAt.getTime() < e.now().getTime()) return "EXPIRED";
  return row.status as Status;
}

/** The row as the API shows it, with its status computed against what is in use right now. */
async function viewNow(e: Engine, row: Config) {
  const active = await activePayoutConfig(e, e.db, row.merchantId, row.networkId);
  return payoutView(e, row, active?.id ?? null);
}

function payoutView(e: Engine, row: Config, activeId: string | null = null) {
  return {
    id: row.id,
    object: "payout_config",
    network: row.networkId,
    mode: row.mode as PayoutMode,
    address: row.address ? getAddress(row.address) : null,
    status: statusOf(e, row, activeId),
    requested_at: row.createdAt.toISOString(),
    confirmed_at: row.confirmedAt?.toISOString() ?? null,
    active_from: row.activeFrom?.toISOString() ?? null,
    confirmation_expires_at: row.status === "PENDING_CONFIRMATION" ? row.confirmationExpiresAt?.toISOString() ?? null : null,
  };
}

/** Per network: how this merchant is paid now, what is waiting, the fee, and the vault. */
export async function listPayoutMethods(e: Engine, ctx: AuthContext) {
  const [merchant] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, ctx.merchantId));
  const vaults = await e.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, ctx.merchantId));
  const rows = await e.db.select().from(schema.merchantPayoutConfigs).where(eq(schema.merchantPayoutConfigs.merchantId, ctx.merchantId)).orderBy(desc(schema.merchantPayoutConfigs.createdAt));
  const out = [];
  for (const chain of e.chains.values()) {
    const id = chain.network.id;
    const active = await activePayoutConfig(e, e.db, ctx.merchantId, id);
    const mineV = vaults.filter((v) => v.networkId === id);
    const vault = mineV.find((v) => v.tokenSymbol === "USDC") ?? mineV[0];
    const mine = rows.filter((r) => r.networkId === id);
    const waiting = mine.find((r) => statusOf(e, r, active?.id ?? null) === "PENDING_CONFIRMATION") ?? mine.find((r) => statusOf(e, r, active?.id ?? null) === "COOLING_DOWN");
    const direct = active?.mode === "DIRECT" && active.address;
    const custodial = active?.mode === "CUSTODIAL" && active.address ? active : null;
    const fee = feeBpsFor(e, merchant?.feeBps, chain);
    out.push({
      network: id,
      name: chain.network.name,
      environment: chain.network.environment,
      operational: chain.operational,
      mode: (custodial ? "CUSTODIAL" : direct ? "DIRECT" : "VAULT") as PayoutMode,
      // Custodial: payments go to the platform custody wallet, and `withdrawal_wallet` is where the balance can be sent.
      destination: custodial && chain.custody ? getAddress(chain.custody.address) : direct ? getAddress(active.address!) : vault ? getAddress(vault.vaultAddress) : null,
      withdrawal_wallet: custodial ? getAddress(custodial.address!) : null,
      custody_available: !!(e.cfg.custodyEnabled && chain.custody),
      status: direct || custodial ? "ACTIVE" : vault?.status === "ACTIVE" ? "ACTIVE" : vault ? "SETTING_UP" : "NOT_SET_UP",
      fee: { bps: fee, percent: formatFeePercent(fee), treasury: getAddress(chain.deployment.treasury) },
      vault: vault ? { status: vault.status, address: getAddress(vault.vaultAddress), owner: getAddress(vault.ownerAddress) } : null,
      pending: waiting ? payoutView(e, waiting, active?.id ?? null) : null,
      email_confirmation_required: e.cfg.requireEmailConfirmation,
      cooldown_hours: cooldownHours(e),
    });
  }
  return out;
}

export async function listPayoutHistory(e: Engine, ctx: AuthContext, limit = 50) {
  const rows = await e.db.select().from(schema.merchantPayoutConfigs).where(eq(schema.merchantPayoutConfigs.merchantId, ctx.merchantId)).orderBy(desc(schema.merchantPayoutConfigs.createdAt)).limit(limit);
  const ids = new Map<string, string | null>();
  for (const r of rows) if (!ids.has(r.networkId)) ids.set(r.networkId, (await activePayoutConfig(e, e.db, ctx.merchantId, r.networkId))?.id ?? null);
  return rows.map((r) => payoutView(e, r, ids.get(r.networkId) ?? null));
}
