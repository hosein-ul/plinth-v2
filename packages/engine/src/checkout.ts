import { and, count, eq, schema } from "@plinth/db";
import { computeFee, destinationKindIndex, newId, formatAmount, toBytes32Id, type DestinationKind } from "@plinth/shared";
import { buildReceiveAuthorization, recoverAuthorizationSigner, splitSignature, type RouterPayment } from "@plinth/blockchain";
import { getAddress, isAddressEqual, toHex, type Address, type Hex } from "viem";
import { randomBytes } from "node:crypto";
import { audit } from "./audit";
import { EngineError, norm, tokenRuntime, type Engine } from "./context";
import { committedRoute } from "./payout-route";
import { loadIntentView } from "./view";

const OPEN: string[] = ["AWAITING_PAYMENT", "DETECTED", "CONFIRMING", "INVALID_ASSET", "CREATED"];

/** The capability URL (`/pay/<unguessable id>`) is the only credential the public checkout needs. */
export async function publicCheckout(e: Engine, id: string) {
  const view = await loadIntentView(e, e.db, id);
  if (!view) throw new EngineError("NOT_FOUND", "Payment not found", 404);
  const [row] = await e.db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, id));
  const [merchant] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, row!.merchantId));
  const txs = await e.db.select().from(schema.transactions).where(eq(schema.transactions.paymentIntentId, id)).orderBy(schema.transactions.firstSeenAt);
  const remaining = row!.amount - row!.amountFinal - row!.amountPending;
  const now = e.now();
  return {
    ...view,
    // The payment page is a capability URL that is shared with the customer. Merchant-internal fields do not belong on it.
    customer_email: null,
    metadata: {},
    merchant_name: merchant?.name ?? "",
    seconds_remaining: Math.max(0, Math.floor((row!.expiresAt.getTime() - now.getTime()) / 1000)),
    remaining_units: (remaining > 0n ? remaining : 0n).toString(),
    remaining: formatAmount(remaining > 0n ? remaining : 0n),
    // Wallet capability is reported per network from verified token behaviour AND relayer availability.
    networks: view.networks.map((n) => {
      const c = e.chains.get(n.network)!;
      const wallet = n.wallet_checkout_supported && !!c.signer && !!c.tokens.get(row!.currency as never)?.operational;
      return { ...n, wallet_checkout_supported: wallet, wallet_unavailable_reason: wallet ? null : !n.wallet_checkout_supported ? `The ${n.token.symbol} contract on this network does not support gasless authorization.` : "Gasless relaying is not available on this network right now." };
    }),
    payments: txs.filter((t) => t.kind !== "SWEEP").map((t) => ({
      network: t.networkId, tx_hash: t.txHash, amount: formatAmount(t.amount), status: t.status, confirmations: t.confirmations,
      official_asset: t.isOfficialAsset, method: t.kind === "WALLET_PAYMENT" ? "WALLET" : "ADDRESS",
      explorer_url: `${e.chains.get(t.networkId)?.network.explorerUrl ?? ""}/tx/${t.txHash}`,
    })),
    open: OPEN.includes(row!.status) && row!.expiresAt > now,
  };
}

// ------------------------------------------------------------------ gasless wallet payment

export async function prepareWalletPayment(e: Engine, intentId: string, input: { network: string; payer: string }) {
  const [intent] = await e.db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentId));
  if (!intent) throw new EngineError("NOT_FOUND", "Payment not found", 404);
  const now = e.now();
  if (!OPEN.includes(intent.status) || intent.expiresAt.getTime() - now.getTime() < 60_000) throw new EngineError("PAYMENT_NOT_OPEN", "This payment is no longer accepting funds", 409);
  if (!intent.checkoutMethods.includes("WALLET")) throw new EngineError("METHOD_DISABLED", "Wallet checkout is not enabled for this payment", 409);
  if (!intent.allowedNetworks.includes(input.network)) throw new EngineError("NETWORK_NOT_ALLOWED", "This network is not enabled for this payment", 400);
  const chain = e.chains.get(input.network);
  if (!chain || !chain.operational) throw new EngineError("NETWORK_NOT_OPERATIONAL", "This network is not available", 409);
  const tr = tokenRuntime(chain, intent.currency);
  if (!chain.signer) throw new EngineError("WALLET_UNAVAILABLE", "Gasless payments are unavailable on this network. Pay with the deposit address instead.", 409);
  // Gasless checkout needs the token's own EIP-3009 support (probed per token); otherwise the deposit address is the way to pay.
  if (!tr.config.authorization.verified || !tr.config.authorization.receiveWithAuthorization) throw new EngineError("WALLET_UNAVAILABLE", `This network's ${tr.symbol} does not support gasless authorization. Pay with the deposit address instead.`, 409);

  const [{ n } = { n: 0 }] = await e.db.select({ n: count() }).from(schema.paymentAttempts).where(eq(schema.paymentAttempts.paymentIntentId, intentId));
  if (n >= 25) throw new EngineError("TOO_MANY_ATTEMPTS", "Too many payment attempts for this payment", 429);

  // The destination and fee were committed when the payment was created; changing payout settings later does not touch them.
  const route = await committedRoute(e.db, intent.id, input.network);
  if (!route) throw new EngineError("WALLET_UNAVAILABLE", "This payment has no payout route on this network. Pay with the deposit address instead.", 409);

  const remaining = intent.amount - intent.amountFinal - intent.amountPending;
  if (remaining <= 0n) throw new EngineError("ALREADY_PAID", "This payment is already fully funded", 409);
  const payer = getAddress(input.payer);
  const balance = await tr.adapter.tokenBalanceOf(payer);
  if (balance < remaining) throw new EngineError("INSUFFICIENT_BALANCE", `Your wallet holds ${formatAmount(balance)} ${tr.symbol} on ${chain.network.name}; ${formatAmount(remaining)} is required.`, 422, { balance_units: balance.toString(), required_units: remaining.toString() });

  // Authorization windows are enforced by the token against BLOCK time, so build them from chain time
  // (robust to clock skew between this server and the network), capped by the invoice expiry.
  const nowSec = Number((await chain.client.getBlock()).timestamp);
  const validBefore = Math.min(nowSec + 15 * 60, Math.floor(intent.expiresAt.getTime() / 1000) - 10);
  const payment: RouterPayment = {
    from: payer, destination: getAddress(route.destinationAddress), kind: destinationKindIndex(route.destinationKind as DestinationKind), feeBps: route.feeBps,
    merchantId: toBytes32Id(intent.merchantId), invoiceId: intent.invoiceId32 as Hex,
    value: remaining, validAfter: BigInt(nowSec - 600), validBefore: BigInt(validBefore), salt: toHex(randomBytes(32)),
  };
  const auth = buildReceiveAuthorization(chain.network, tr.contracts.paymentRouter, getAddress(route.treasuryAddress), payment, tr.config);
  const attemptId = newId("att");
  await e.db.insert(schema.paymentAttempts).values({
    id: attemptId, paymentIntentId: intentId, merchantId: intent.merchantId, networkId: input.network, method: "WALLET", status: "PREPARED", payer: norm(payer), amount: remaining, nonce: auth.nonce.toLowerCase(),
    authorization: { destination: payment.destination, kind: String(payment.kind), feeBps: String(payment.feeBps), treasury: route.treasuryAddress, merchantId: payment.merchantId, invoiceId: payment.invoiceId, value: payment.value.toString(), validAfter: payment.validAfter.toString(), validBefore: payment.validBefore.toString(), salt: payment.salt },
  });
  return {
    attempt_id: attemptId,
    network: input.network,
    currency: tr.symbol,
    amount: formatAmount(remaining),
    amount_units: remaining.toString(),
    expires_at: new Date(validBefore * 1000).toISOString(),
    // The customer's wallet signs this exact EIP-712 payload; the destination (`to`) is the PaymentRouter.
    typed_data: {
      domain: { ...auth.domain, chainId: auth.domain.chainId },
      types: { ...auth.types, EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] },
      primaryType: auth.primaryType,
      message: { from: auth.message.from, to: auth.message.to, value: auth.message.value.toString(), validAfter: auth.message.validAfter.toString(), validBefore: auth.message.validBefore.toString(), nonce: auth.message.nonce },
    },
    fee: { customer_network_fee: "0", note: "No network fee for you: the transaction is relayed and its fee is paid by the gateway operator." },
    // The platform fee is taken from the merchant's side of this payment: the customer pays exactly the amount above.
    platform_fee: { bps: route.feeBps, amount_units: computeFee(remaining, route.feeBps).toString(), amount: formatAmount(computeFee(remaining, route.feeBps), undefined, { minDecimals: 2 }) },
  };
}

export async function submitWalletPayment(e: Engine, intentId: string, input: { attempt_id: string; signature: string }) {
  const [attempt] = await e.db.select().from(schema.paymentAttempts).where(and(eq(schema.paymentAttempts.id, input.attempt_id), eq(schema.paymentAttempts.paymentIntentId, intentId)));
  if (!attempt || attempt.method !== "WALLET") throw new EngineError("NOT_FOUND", "Payment attempt not found", 404);
  if (attempt.status !== "PREPARED") throw new EngineError("ATTEMPT_USED", "This payment attempt was already submitted", 409);
  const [intent] = await e.db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentId));
  if (!intent || !OPEN.includes(intent.status)) throw new EngineError("PAYMENT_NOT_OPEN", "This payment is no longer accepting funds", 409);
  const chain = e.chains.get(attempt.networkId);
  if (!chain || !chain.operational || !chain.signer) throw new EngineError("WALLET_UNAVAILABLE", "Gasless payments are unavailable right now", 409);
  const tr = tokenRuntime(chain, intent.currency);

  const a = attempt.authorization!;
  const payment: RouterPayment = {
    from: getAddress(attempt.payer!), destination: a.destination as Address, kind: Number(a.kind), feeBps: Number(a.feeBps),
    merchantId: a.merchantId as Hex, invoiceId: a.invoiceId as Hex,
    value: BigInt(a.value!), validAfter: BigInt(a.validAfter!), validBefore: BigInt(a.validBefore!), salt: a.salt as Hex,
  };
  const nowSec = (await chain.client.getBlock()).timestamp;
  if (payment.validBefore <= nowSec + 20n) throw new EngineError("AUTHORIZATION_EXPIRED", "This authorization expired. Please start again.", 410);

  // The signature must be by the payer over EXACTLY the payload we issued. Anything else is rejected.
  const auth = buildReceiveAuthorization(chain.network, tr.contracts.paymentRouter, getAddress(a.treasury!), payment, tr.config);
  if (auth.nonce.toLowerCase() !== attempt.nonce) throw new EngineError("INTERNAL", "Authorization mismatch", 500);
  let signer: Address;
  try {
    signer = await recoverAuthorizationSigner(auth, input.signature as Hex);
  } catch {
    throw new EngineError("INVALID_SIGNATURE", "The signature is not valid", 400);
  }
  if (!isAddressEqual(signer, payment.from)) throw new EngineError("INVALID_SIGNATURE", "The signature was not made by the paying wallet", 400);
  if (await chain.adapter.isAuthorizationUsed(payment.from, auth.nonce)) throw new EngineError("ATTEMPT_USED", "This authorization was already used", 409);
  if ((await tr.adapter.tokenBalanceOf(payment.from)) < payment.value) throw new EngineError("INSUFFICIENT_BALANCE", `The wallet no longer holds enough ${tr.symbol}`, 422);

  const { v, r, s } = splitSignature(input.signature as Hex);
  const call = tr.adapter.encodePay(payment, v, r, s);
  const opId = newId("rop");
  await e.db.transaction(async (tx) => {
    // Claim the attempt atomically so a double-submit cannot create two relayer operations.
    const claimed = await tx.update(schema.paymentAttempts).set({ status: "SUBMITTED", relayerOperationId: null, updatedAt: e.now() }).where(and(eq(schema.paymentAttempts.id, attempt.id), eq(schema.paymentAttempts.status, "PREPARED"))).returning({ id: schema.paymentAttempts.id });
    if (claimed.length === 0) throw new EngineError("ATTEMPT_USED", "This payment attempt was already submitted", 409);
    await tx.insert(schema.relayerOperations).values({ id: opId, networkId: attempt.networkId, kind: "WALLET_PAYMENT", tokenSymbol: tr.symbol, dedupeKey: `wallet:${attempt.id}`, toAddress: norm(call.to), calldata: call.data, relatedType: "payment_attempt", relatedId: attempt.id });
    await tx.update(schema.paymentAttempts).set({ relayerOperationId: opId }).where(eq(schema.paymentAttempts.id, attempt.id));
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: intentId, type: "wallet_payment.submitted", data: { network: attempt.networkId, payer: attempt.payer, amount_units: payment.value.toString() } });
    await audit(tx, { merchantId: intent.merchantId, actor: { type: "SYSTEM" }, action: "wallet_payment.submitted", targetType: "payment_attempt", targetId: attempt.id });
  });
  return { attempt_id: attempt.id, status: "SUBMITTED" as const, message: "Authorization accepted. The payment will show as confirmed once it is verified on-chain." };
}

export async function attemptStatus(e: Engine, intentId: string, attemptId: string) {
  const [a] = await e.db.select().from(schema.paymentAttempts).where(and(eq(schema.paymentAttempts.id, attemptId), eq(schema.paymentAttempts.paymentIntentId, intentId)));
  if (!a) throw new EngineError("NOT_FOUND", "Attempt not found", 404);
  return { attempt_id: a.id, status: a.status, tx_hash: a.txHash, error: a.error };
}
