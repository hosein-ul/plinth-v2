import { and, desc, eq, schema } from "@plinth/db";
import { formatUsdc, newId, parseUsdc } from "@plinth/shared";
import { getAddress, isAddressEqual, parseAbiItem, decodeEventLog, type Hex } from "viem";
import { audit } from "./audit";
import { requirePermission, type AuthContext } from "./auth";
import { EngineError, norm, tokenRuntime, type Engine } from "./context";
import { committedRoute } from "./payout-route";
import { recomputeIntent } from "./recompute";
import { emitEvent } from "./webhooks";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/**
 * A refund is a NEW, merchant-authorised transfer out of the account that received the money: their vault (vault
 * mode, via vault.withdraw) or their own payout wallet (direct mode). Never a reversal, and the gateway never holds
 * the funds. The gateway records the request; the merchant sends the USDC from their own wallet; the refund
 * completes only after that transfer is verified on-chain. The platform fee is not refunded, so the most that can
 * be returned is what the merchant actually received.
 */
export async function requestRefund(e: Engine, ctx: AuthContext, input: { payment_intent_id: string; amount: string; recipient: string; reason?: string }) {
  requirePermission(ctx, "payments");
  const [intent] = await e.db.select().from(schema.paymentIntents).where(and(eq(schema.paymentIntents.id, input.payment_intent_id), eq(schema.paymentIntents.merchantId, ctx.merchantId)));
  if (!intent) throw new EngineError("NOT_FOUND", "Payment not found", 404);
  const amount = parseUsdc(input.amount);
  const refunds = await e.db.select().from(schema.refunds).where(eq(schema.refunds.paymentIntentId, intent.id));
  const committed = refunds.filter((r) => r.status === "REQUESTED" || r.status === "COMPLETED").reduce((a, r) => a + r.amount, 0n);
  // What the merchant received after the platform fee (the fee is not refunded). Nothing has reached them until a sweep or wallet payment is final.
  const refundable = intent.netAmount;
  if (refundable <= 0n) throw new EngineError("NOTHING_TO_REFUND", "Nothing has been delivered to you yet, so there is nothing to refund. Funds can be refunded once they have settled.", 422);
  if (amount + committed > refundable) {
    const left = refundable > committed ? refundable - committed : 0n;
    throw new EngineError("REFUND_EXCEEDS_PAYMENT", `Only ${formatUsdc(left)} ${intent.currency} remains refundable. The platform fee is not refunded.`, 422);
  }

  // Refunds go to the network the funds arrived on.
  const [firstTx] = await e.db.select().from(schema.transactions).where(and(eq(schema.transactions.paymentIntentId, intent.id), eq(schema.transactions.status, "FINAL"), eq(schema.transactions.isOfficialAsset, true))).orderBy(desc(schema.transactions.finalizedAt));
  if (!firstTx) throw new EngineError("NOTHING_TO_REFUND", "No finalized payment to refund", 422);
  // A custodial payment sits in the platform's custody wallet, not in an account the merchant controls, so the merchant cannot send the refund
  // from where the money is. Refunding custodial payments is not supported yet.
  const route = await committedRoute(e.db, intent.id, firstTx.networkId);
  if (route?.custodial) throw new EngineError("REFUND_UNSUPPORTED_CUSTODIAL", "This payment was settled to your custody balance. Refunds of custodial payments are not supported yet; contact support.", 422);
  const id = newId("ref");
  await e.db.transaction(async (tx) => {
    // Lock the payment and check again under the lock: two requests at the same moment must not both fit into what is left.
    const [locked] = await tx.select({ netAmount: schema.paymentIntents.netAmount }).from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intent.id)).for("update");
    const nowCommitted = (await tx.select().from(schema.refunds).where(eq(schema.refunds.paymentIntentId, intent.id))).filter((r) => r.status === "REQUESTED" || r.status === "COMPLETED").reduce((a, r) => a + r.amount, 0n);
    if (amount + nowCommitted > (locked?.netAmount ?? 0n)) throw new EngineError("REFUND_EXCEEDS_PAYMENT", "Only a smaller amount remains refundable. The platform fee is not refunded.", 422);
    await tx.insert(schema.refunds).values({ id, merchantId: ctx.merchantId, paymentIntentId: intent.id, networkId: firstTx.networkId, amount, recipient: norm(getAddress(input.recipient)), reason: input.reason ?? null });
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: intent.id, type: "refund.requested", data: { refund_id: id, amount_units: amount.toString() } });
    await emitEvent(e, tx, { merchantId: ctx.merchantId, environment: intent.environment, type: "refund.requested", paymentIntentId: intent.id, dedupeKey: `refund.requested:${id}`, extra: { refund: { id, amount: formatUsdc(amount), recipient: input.recipient } } });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "refund.requested", targetType: "refund", targetId: id });
    await recomputeIntent(e, tx, intent.id);
  });
  return getRefund(e, ctx, id);
}

/** Attach the merchant's own vault->recipient transfer. Verified independently before anything completes. */
export async function submitRefundProof(e: Engine, ctx: AuthContext, refundId: string, txHash: Hex) {
  requirePermission(ctx, "payments");
  const [r] = await e.db.select().from(schema.refunds).where(and(eq(schema.refunds.id, refundId), eq(schema.refunds.merchantId, ctx.merchantId)));
  if (!r) throw new EngineError("NOT_FOUND", "Refund not found", 404);
  if (r.status !== "REQUESTED") throw new EngineError("INVALID_STATE", `Refund is ${r.status}`, 409);
  const chain = e.chains.get(r.networkId);
  if (!chain) throw new EngineError("UNKNOWN_NETWORK", "Network unavailable", 400);
  // The refund is in the payment's own token.
  const [intent] = await e.db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, r.paymentIntentId));
  const tokenAddress = tokenRuntime(chain, intent!.currency, { open: false }).config.address;
  // The refund must leave the account the money was delivered to: the destination committed for this payment.
  const route = await committedRoute(e.db, r.paymentIntentId, r.networkId);
  let source: string;
  if (route) source = route.destinationAddress;
  else {
    const [vault] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, ctx.merchantId), eq(schema.merchantVaults.networkId, r.networkId), eq(schema.merchantVaults.tokenSymbol, intent!.currency)));
    if (!vault) throw new EngineError("NOT_FOUND", "Vault not found", 404);
    source = vault.vaultAddress;
  }

  const receipt = await chain.client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") throw new EngineError("PROOF_INVALID", "Transaction not found or reverted", 422);
  const info = await chain.adapter.getHeadInfo();
  if (!chain.adapter.isFinal(receipt.blockNumber, info)) throw new EngineError("PROOF_PENDING", "Transaction is not final yet; retry shortly", 409);

  const match = receipt.logs.find((l) => {
    if (!isAddressEqual(l.address, tokenAddress)) return false;
    try {
      const d = decodeEventLog({ abi: [transferEvent], data: l.data, topics: l.topics });
      return isAddressEqual(d.args.from, source as Hex) && isAddressEqual(d.args.to, r.recipient as Hex) && d.args.value === r.amount;
    } catch {
      return false;
    }
  });
  if (!match) throw new EngineError("PROOF_INVALID", `No matching ${intent!.currency} transfer from ${route?.destinationKind === "DIRECT" ? "your payout wallet" : "your vault"} to the recipient for this amount was found in that transaction`, 422);

  await e.db.transaction(async (tx) => {
    // A transfer can prove only one refund: the unique index on (tx_hash, log_index) is the backstop, reported as a clean error.
    const [reused] = await tx.select({ id: schema.refunds.id }).from(schema.refunds).where(and(eq(schema.refunds.txHash, txHash), eq(schema.refunds.logIndex, match.logIndex)));
    if (reused && reused.id !== r.id) throw new EngineError("PROOF_INVALID", "That transfer already completed another refund", 422);
    const updated = await tx.update(schema.refunds).set({ status: "COMPLETED", txHash, logIndex: match.logIndex, completedAt: e.now() }).where(and(eq(schema.refunds.id, r.id), eq(schema.refunds.status, "REQUESTED"))).returning();
    if (updated.length === 0) return;
    await tx.insert(schema.ledgerEntries).values({ id: newId("led"), merchantId: ctx.merchantId, paymentIntentId: r.paymentIntentId, networkId: r.networkId, account: "REFUNDED", direction: "CREDIT", amount: r.amount, refType: "refund", refId: r.id, idempotencyKey: `REFUNDED:${r.id}:CREDIT` }).onConflictDoNothing();
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: r.paymentIntentId, type: "refund.completed", data: { refund_id: r.id, tx_hash: txHash } });
    const [intent] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, r.paymentIntentId));
    await recomputeIntent(e, tx, r.paymentIntentId);
    await emitEvent(e, tx, { merchantId: ctx.merchantId, environment: intent!.environment, type: "refund.completed", paymentIntentId: r.paymentIntentId, dedupeKey: `refund.completed:${r.id}`, extra: { refund: { id: r.id, amount: formatUsdc(r.amount), tx_hash: txHash } } });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "refund.completed", targetType: "refund", targetId: r.id, data: { txHash } });
  });
  return getRefund(e, ctx, refundId);
}

export async function rejectRefund(e: Engine, ctx: AuthContext, refundId: string) {
  requirePermission(ctx, "payments");
  const res = await e.db.transaction(async (tx) => {
    const u = await tx.update(schema.refunds).set({ status: "REJECTED" }).where(and(eq(schema.refunds.id, refundId), eq(schema.refunds.merchantId, ctx.merchantId), eq(schema.refunds.status, "REQUESTED"))).returning();
    if (u[0]) await recomputeIntent(e, tx, u[0].paymentIntentId);
    return u[0];
  });
  if (!res) throw new EngineError("NOT_FOUND", "Open refund request not found", 404);
  return getRefund(e, ctx, refundId);
}

const view = (e: Engine, r: typeof schema.refunds.$inferSelect, pay: { kind: string; address: string } | null = null) => ({
  id: r.id, object: "refund_request",
  /** Where the merchant must send the refund from: the vault or the payout wallet the money was delivered to. */
  pay_from: pay ? { kind: pay.kind, address: getAddress(pay.address) } : null, payment_intent_id: r.paymentIntentId, network: r.networkId, status: r.status, amount: formatUsdc(r.amount), amount_units: r.amount.toString(),
  recipient: getAddress(r.recipient), reason: r.reason, tx_hash: r.txHash, explorer_url: r.txHash ? `${e.chains.get(r.networkId)?.network.explorerUrl}/tx/${r.txHash}` : null,
  created_at: r.createdAt.toISOString(), completed_at: r.completedAt?.toISOString() ?? null,
});

async function sourceOf(e: Engine, r: typeof schema.refunds.$inferSelect) {
  const route = await committedRoute(e.db, r.paymentIntentId, r.networkId);
  if (route) return { kind: route.destinationKind, address: route.destinationAddress };
  const [vault] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, r.merchantId), eq(schema.merchantVaults.networkId, r.networkId)));
  return vault ? { kind: "VAULT", address: vault.vaultAddress } : null;
}

export async function getRefund(e: Engine, ctx: AuthContext, id: string) {
  const [r] = await e.db.select().from(schema.refunds).where(and(eq(schema.refunds.id, id), eq(schema.refunds.merchantId, ctx.merchantId)));
  if (!r) throw new EngineError("NOT_FOUND", "Refund not found", 404);
  return view(e, r, await sourceOf(e, r));
}

export async function listRefunds(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.refunds).where(eq(schema.refunds.merchantId, ctx.merchantId)).orderBy(desc(schema.refunds.createdAt)).limit(100);
  const out = [];
  for (const r of rows) out.push(view(e, r, await sourceOf(e, r)));
  return out;
}
