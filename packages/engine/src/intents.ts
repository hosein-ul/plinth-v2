import { randomBytes } from "node:crypto";
import { and, desc, eq, ilike, inArray, lt, or, schema, sql, type Executor } from "@plinth/db";
import { DEFAULT_EXPIRY_SECONDS, formatAmount, formatUsdc, isTokenSymbol, newId, parseAmount, parseUsdc, toBytes32Id, TOKEN_DECIMALS, type CreatePaymentIntentInput, type TokenSymbol } from "@plinth/shared";
import { getAddress, type Hex } from "viem";
import { audit } from "./audit";
import { requirePermission, type AuthContext } from "./auth";
import { EngineError, norm, tokenRuntime, type Engine } from "./context";
import { resolveRoute, type PayoutRoute } from "./payout-route";
import { loadIntentView, loadIntentViews, type IntentView } from "./view";

export interface CreateOpts {
  kind?: "PAYMENT_INTENT" | "INVOICE" | "PAYMENT_LINK";
  paymentLinkId?: string;
  /** Override the default expiry (used by invoices with a due date). */
  expiresAt?: Date;
  tx?: Executor;
}

/**
 * Create a payment intent and, for each eligible network, the counterfactual deposit address.
 * Networks are eligible only when: operational, matching the key environment (test→testnets,
 * live→mainnets), and the merchant has an ACTIVE vault there.
 */
export async function createPaymentIntent(e: Engine, ctx: AuthContext, input: CreatePaymentIntentInput, opts: CreateOpts = {}): Promise<IntentView> {
  requirePermission(ctx, "payments");
  const symbol = (input.currency ?? "USDC") as TokenSymbol;
  if (!isTokenSymbol(symbol)) throw new EngineError("UNSUPPORTED_TOKEN", `Unsupported currency ${String(input.currency)}`, 400);
  const amount = parseAmount(input.amount, TOKEN_DECIMALS, symbol);
  const wantEnv = ctx.environment === "live" ? "mainnet" : "testnet";

  const vaults = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, ctx.merchantId), eq(schema.merchantVaults.status, "ACTIVE")));
  const [merchant] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, ctx.merchantId));
  if (input.networks) {
    const unknown = input.networks.filter((n) => !e.chains.has(n));
    if (unknown.length) throw new EngineError("UNKNOWN_NETWORK", `Unknown network(s): ${unknown.join(", ")}`, 400);
  }
  // A network is offered only when the merchant can actually be paid there: an active vault, or an active payout wallet.
  const routes: PayoutRoute[] = [];
  for (const c of e.chains.values()) {
    // The token must be open on this network (its own contracts verified), not only USDC.
    if (!c.operational || !c.tokens.get(symbol)?.operational || c.network.environment !== wantEnv || (input.networks && !input.networks.includes(c.network.id))) continue;
    const r = await resolveRoute(e, opts.tx ?? e.db, merchant!, c, vaults, symbol);
    if (r) routes.push(r);
  }
  const candidates = [...e.chains.values()].filter((c) => routes.some((r) => r.networkId === c.network.id));
  if (candidates.length === 0) {
    throw new EngineError("NO_NETWORK_AVAILABLE", `No ${wantEnv} network is available for ${symbol}. Set up a payout method first (a ${symbol} vault, or a payout wallet).`, 422);
  }

  const id = newId("pi");
  const invoiceId32 = toBytes32Id(id);
  const merchantId32 = toBytes32Id(ctx.merchantId);
  const expiresAt = opts.expiresAt ?? new Date(e.now().getTime() + (input.expires_in_seconds ?? merchant?.defaultExpirySeconds ?? DEFAULT_EXPIRY_SECONDS) * 1000);
  const methods = input.checkout_methods ?? ["WALLET", "ADDRESS"];

  // Derive addresses (and cross-check them against the deployed factory) BEFORE touching the DB.
  const addresses: { chain: (typeof candidates)[number]; address: string; route: PayoutRoute; createdBlock: bigint }[] = [];
  if (methods.includes("ADDRESS")) {
    for (const chain of candidates) {
      const route = routes.find((r) => r.networkId === chain.network.id)!;
      const adapter = tokenRuntime(chain, symbol).adapter;
      const offline = adapter.predictInvoiceAddress(route, merchantId32, invoiceId32);
      const onchain = await adapter.predictInvoiceAddressOnChain(route, merchantId32, invoiceId32);
      if (norm(offline) !== norm(onchain)) {
        // Never show an address we cannot prove. This indicates a registry/deployment mismatch.
        e.log.error("invoice address derivation mismatch", { network: chain.network.id, offline, onchain });
        throw new EngineError("ADDRESS_DERIVATION_MISMATCH", "Could not derive a verified deposit address for this network", 500);
      }
      addresses.push({ chain, address: offline, route, createdBlock: await chain.client.getBlockNumber() });
    }
  }

  const run = async (tx: Executor) => {
    await tx.insert(schema.paymentIntents).values({
      id, invoiceId32, merchantId: ctx.merchantId, environment: ctx.environment, kind: opts.kind ?? "PAYMENT_INTENT", paymentLinkId: opts.paymentLinkId ?? null,
      orderReference: input.order_reference ?? null, description: input.description ?? null, amount, currency: symbol,
      allowedNetworks: candidates.map((c) => c.network.id), checkoutMethods: methods, status: "AWAITING_PAYMENT", expiresAt,
      customerEmail: input.customer_email ?? null, successUrl: input.success_url ?? null, cancelUrl: input.cancel_url ?? null, metadata: input.metadata ?? {},
    });
    // The route is committed per network whichever checkout method is used, so a wallet payment and a deposit address always agree.
    for (const r of routes.filter((x) => candidates.some((c) => c.network.id === x.networkId))) {
      await tx.insert(schema.paymentIntentRoutes).values({
        id: newId("prt"), paymentIntentId: id, networkId: r.networkId, destinationKind: r.kind, destinationAddress: norm(r.destination),
        feeBps: r.feeBps, treasuryAddress: norm(r.treasury), payoutConfigId: r.payoutConfigId, custodial: r.custodial,
      });
    }
    for (const a of addresses) {
      await tx.insert(schema.invoiceAddresses).values({
        id: newId("inv").replace("inv_", "ia_"), paymentIntentId: id, merchantId: ctx.merchantId, networkId: a.chain.network.id, address: norm(a.address),
        vaultAddress: a.route.kind === "VAULT" ? norm(a.route.destination) : null, destinationKind: a.route.kind, destinationAddress: norm(a.route.destination),
        feeBps: a.route.feeBps, treasuryAddress: norm(a.route.treasury), custodial: a.route.custodial, tokenSymbol: symbol,
        merchantId32, invoiceId32, factoryAddress: norm(tokenRuntime(a.chain, symbol).contracts.invoiceFactory), implementationAddress: norm(tokenRuntime(a.chain, symbol).contracts.invoiceImplementation),
        contractVersion: tokenRuntime(a.chain, symbol).contracts.version, createdBlock: a.createdBlock,
      });
    }
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: id, type: "created", data: { amount_units: amount.toString(), currency: symbol, networks: candidates.map((c) => c.network.id) } });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "payment_intent.created", targetType: "payment_intent", targetId: id });
  };
  if (opts.tx) await run(opts.tx);
  else await e.db.transaction(run);

  return (await loadIntentView(e, opts.tx ?? e.db, id))!;
}

export async function getPaymentIntent(e: Engine, ctx: AuthContext, id: string): Promise<IntentView> {
  // A test key never reads live payments and a live key never reads test payments, even by id (lists already work this way).
  const [row] = await e.db.select().from(schema.paymentIntents).where(and(eq(schema.paymentIntents.id, id), eq(schema.paymentIntents.merchantId, ctx.merchantId), eq(schema.paymentIntents.environment, ctx.environment)));
  if (!row) throw new EngineError("NOT_FOUND", "Payment not found", 404);
  const view = await loadIntentView(e, e.db, id);
  return view!;
}

export interface ListFilter {
  status?: string[];
  q?: string;
  network?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string; // created_at ISO of the last item
}

export async function listPayments(e: Engine, ctx: AuthContext, f: ListFilter = {}) {
  const limit = Math.min(f.limit ?? 25, 100);
  const conds = [eq(schema.paymentIntents.merchantId, ctx.merchantId), eq(schema.paymentIntents.environment, ctx.environment)];
  if (f.status?.length) conds.push(inArray(schema.paymentIntents.status, f.status));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(schema.paymentIntents.id, like), ilike(schema.paymentIntents.orderReference, like), ilike(schema.paymentIntents.customerEmail, like), ilike(schema.paymentIntents.description, like))!);
  }
  if (f.network) conds.push(sql`${f.network} = any(${schema.paymentIntents.allowedNetworks})`);
  if (f.from) conds.push(sql`${schema.paymentIntents.createdAt} >= ${f.from}`);
  if (f.to) conds.push(sql`${schema.paymentIntents.createdAt} <= ${f.to}`);
  if (f.cursor) conds.push(lt(schema.paymentIntents.createdAt, new Date(f.cursor)));
  const rows = await e.db.select().from(schema.paymentIntents).where(and(...conds)).orderBy(desc(schema.paymentIntents.createdAt)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { data: await loadIntentViews(e, e.db, page), has_more: rows.length > limit, next_cursor: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null };
}

/** Full detail for the payment page: timeline, every observed on-chain movement, settlements, attempts, refunds. */
export async function paymentDetail(e: Engine, ctx: AuthContext, id: string) {
  const view = await getPaymentIntent(e, ctx, id);
  const [timeline, txs, stls, attempts, refunds, addrs, routes] = await Promise.all([
    e.db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.paymentIntentId, id)).orderBy(schema.paymentEvents.createdAt),
    e.db.select().from(schema.transactions).where(eq(schema.transactions.paymentIntentId, id)).orderBy(schema.transactions.firstSeenAt),
    e.db.select().from(schema.settlements).where(eq(schema.settlements.paymentIntentId, id)).orderBy(schema.settlements.createdAt),
    e.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.paymentIntentId, id)).orderBy(schema.paymentAttempts.createdAt),
    e.db.select().from(schema.refunds).where(eq(schema.refunds.paymentIntentId, id)),
    e.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, id)),
    e.db.select().from(schema.paymentIntentRoutes).where(eq(schema.paymentIntentRoutes.paymentIntentId, id)),
  ]);
  const explorer = (net: string, path: string) => `${e.chains.get(net)?.network.explorerUrl ?? ""}/${path}`;
  return {
    ...view,
    timeline: timeline.map((t) => ({ id: t.id, type: t.type, data: t.data, at: t.createdAt.toISOString() })),
    transactions: txs.map((t) => ({
      id: t.id, kind: t.kind, network: t.networkId, tx_hash: t.txHash, log_index: t.logIndex, status: t.status, official_asset: t.isOfficialAsset,
      token: t.tokenAddress ? getAddress(t.tokenAddress) : null, from: t.fromAddress ? getAddress(t.fromAddress) : null, to: t.toAddress ? getAddress(t.toAddress) : null,
      amount: formatUsdc(t.amount), amount_units: t.amount.toString(), fee_units: t.feeAmount?.toString() ?? null, block_number: t.blockNumber?.toString() ?? null, confirmations: t.confirmations,
      block_time: t.blockTimestamp?.toISOString() ?? null, explorer_url: explorer(t.networkId, `tx/${t.txHash}`),
    })),
    settlements: stls.map((s) => ({ id: s.id, network: s.networkId, kind: s.kind, status: s.status, attempt: s.attemptNo, expected_units: s.expectedAmount.toString(), swept_units: s.sweptAmount?.toString() ?? null, tx_hash: s.txHash, failure_reason: s.failureReason, vault: s.vaultAddress ? getAddress(s.vaultAddress) : null, destination: getAddress(s.destinationAddress), destination_kind: s.destinationKind,
      fee_units: s.feeAmount?.toString() ?? null, net_units: s.netAmount?.toString() ?? null, created_at: s.createdAt.toISOString(), confirmed_at: s.confirmedAt?.toISOString() ?? null, explorer_url: s.txHash ? explorer(s.networkId, `tx/${s.txHash}`) : null })),
    attempts: attempts.map((a) => ({ id: a.id, method: a.method, network: a.networkId, status: a.status, payer: a.payer, tx_hash: a.txHash, error: a.error, created_at: a.createdAt.toISOString() })),
    refunds: refunds.map((r) => ({ id: r.id, status: r.status, amount: formatUsdc(r.amount), recipient: getAddress(r.recipient), tx_hash: r.txHash })),
    /** The payout route committed per network when the payment was created (merchant-only view). */
    payout_routes: routes.map((r) => ({ network: r.networkId, mode: r.custodial ? "CUSTODIAL" : r.destinationKind, custodial: r.custodial, destination: getAddress(r.destinationAddress), fee_bps: r.feeBps, treasury: getAddress(r.treasuryAddress) })),
    invoice_addresses: addrs.map((a) => ({ network: a.networkId, address: getAddress(a.address), vault: a.vaultAddress ? getAddress(a.vaultAddress) : null, destination: getAddress(a.destinationAddress), destination_kind: a.destinationKind, custodial: a.custodial, fee_bps: a.feeBps, deployed: !!a.deployedAt, deploy_tx_hash: a.deployTxHash, factory: getAddress(a.factoryAddress), contract_version: a.contractVersion })),
  };
}

// ------------------------------------------------------------------ payment links

export async function createPaymentLink(e: Engine, ctx: AuthContext, input: { name: string; amount: string; currency?: TokenSymbol; description?: string; networks?: string[]; checkout_methods: string[]; success_url?: string; intent_expires_in_seconds: number }) {
  requirePermission(ctx, "payments");
  const currency = input.currency ?? "USDC";
  parseAmount(input.amount, TOKEN_DECIMALS, currency);
  const wantEnv = ctx.environment === "live" ? "mainnet" : "testnet";
  const nets = (input.networks ?? [...e.chains.values()].filter((c) => c.network.environment === wantEnv).map((c) => c.network.id));
  const id = newId("pl");
  const slug = randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");
  await e.db.insert(schema.paymentLinks).values({
    id, merchantId: ctx.merchantId, environment: ctx.environment, slug, name: input.name, description: input.description ?? null, amount: parseAmount(input.amount, TOKEN_DECIMALS, currency), currency,
    allowedNetworks: nets, checkoutMethods: input.checkout_methods, successUrl: input.success_url ?? null, intentExpirySeconds: input.intent_expires_in_seconds,
  });
  await audit(e.db, { merchantId: ctx.merchantId, actor: ctx.actor, action: "payment_link.created", targetType: "payment_link", targetId: id });
  return linkView(e, (await e.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.id, id)))[0]!);
}

const linkView = (e: Engine, l: typeof schema.paymentLinks.$inferSelect) => ({
  id: l.id, object: "payment_link", livemode: l.environment === "live", name: l.name, description: l.description, currency: l.currency, amount: formatAmount(l.amount), amount_units: l.amount.toString(),
  networks: l.allowedNetworks, checkout_methods: l.checkoutMethods, active: l.active, url: `${e.cfg.publicWebUrl.replace(/\/$/, "")}/l/${l.slug}`, created_at: l.createdAt.toISOString(),
});

export async function listPaymentLinks(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.paymentLinks).where(and(eq(schema.paymentLinks.merchantId, ctx.merchantId), eq(schema.paymentLinks.environment, ctx.environment))).orderBy(desc(schema.paymentLinks.createdAt));
  return rows.map((l) => linkView(e, l));
}

export async function getPaymentLink(e: Engine, ctx: AuthContext, id: string) {
  const [l] = await e.db.select().from(schema.paymentLinks).where(and(eq(schema.paymentLinks.id, id), eq(schema.paymentLinks.merchantId, ctx.merchantId), eq(schema.paymentLinks.environment, ctx.environment)));
  if (!l) throw new EngineError("NOT_FOUND", "Payment link not found", 404);
  return linkView(e, l);
}

export async function setPaymentLinkActive(e: Engine, ctx: AuthContext, id: string, active: boolean) {
  requirePermission(ctx, "payments");
  const r = await e.db.update(schema.paymentLinks).set({ active }).where(and(eq(schema.paymentLinks.id, id), eq(schema.paymentLinks.merchantId, ctx.merchantId))).returning();
  if (!r[0]) throw new EngineError("NOT_FOUND", "Payment link not found", 404);
  return linkView(e, r[0]);
}

/** Public: a visitor opens a link and gets a fresh intent (so each attempt has its own addresses). */
export async function publicLinkInfo(e: Engine, slug: string) {
  const [l] = await e.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.slug, slug));
  if (!l || !l.active) throw new EngineError("NOT_FOUND", "This payment link is not available", 404);
  const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, l.merchantId));
  return { name: l.name, description: l.description, amount: formatAmount(l.amount), currency: l.currency, merchant_name: m?.name ?? "", livemode: l.environment === "live" };
}

export async function createIntentFromLink(e: Engine, slug: string) {
  const [l] = await e.db.select().from(schema.paymentLinks).where(eq(schema.paymentLinks.slug, slug));
  if (!l || !l.active) throw new EngineError("NOT_FOUND", "This payment link is not available", 404);
  const ctx: AuthContext = { merchantId: l.merchantId, environment: l.environment as "test" | "live", actor: { type: "SYSTEM" }, role: "DEVELOPER", via: "api_key" };
  return createPaymentIntent(e, ctx, {
    amount: formatAmount(l.amount), currency: l.currency as TokenSymbol, description: l.name, networks: l.allowedNetworks, checkout_methods: l.checkoutMethods as ("WALLET" | "ADDRESS")[],
    expires_in_seconds: l.intentExpirySeconds, success_url: l.successUrl ?? undefined, order_reference: `link:${l.id}`,
  } as CreatePaymentIntentInput, { kind: "PAYMENT_LINK", paymentLinkId: l.id });
}

// ------------------------------------------------------------------ invoices

export async function createInvoice(
  e: Engine,
  ctx: AuthContext,
  input: { customer_name: string; customer_email: string; memo?: string; due_in_days: number; line_items: { description: string; quantity: number; unit_amount: string }[]; networks?: string[]; checkout_methods: ("WALLET" | "ADDRESS")[]; currency?: TokenSymbol },
) {
  requirePermission(ctx, "payments");
  const currency = input.currency ?? "USDC";
  const total = input.line_items.reduce((a, li) => a + parseAmount(li.unit_amount, TOKEN_DECIMALS, currency) * BigInt(li.quantity), 0n);
  const dueAt = new Date(e.now().getTime() + input.due_in_days * 86_400_000);
  // Not one big transaction: createPaymentIntent performs RPC reads, which must not run inside a DB transaction.
  const [m] = await e.db.update(schema.merchants).set({ invoiceSeq: sql`${schema.merchants.invoiceSeq} + 1` }).where(eq(schema.merchants.id, ctx.merchantId)).returning({ seq: schema.merchants.invoiceSeq });
  const number = `INV-${String(m!.seq).padStart(4, "0")}`;
  const intent = await createPaymentIntent(
    e, ctx,
    { amount: formatAmount(total, TOKEN_DECIMALS, { minDecimals: 6 }), currency, description: `Invoice ${number}`, order_reference: number, networks: input.networks, checkout_methods: input.checkout_methods, expires_in_seconds: 0, customer_email: input.customer_email } as CreatePaymentIntentInput,
    { kind: "INVOICE", expiresAt: dueAt },
  );
  const id = newId("inv");
  await e.db.insert(schema.invoices).values({ id, merchantId: ctx.merchantId, paymentIntentId: intent.id, number, customerName: input.customer_name, customerEmail: input.customer_email, memo: input.memo ?? null, lineItems: input.line_items.map((l) => ({ description: l.description, quantity: l.quantity, unitAmount: l.unit_amount })), dueAt });
  return { id, object: "invoice", number, customer_name: input.customer_name, customer_email: input.customer_email, memo: input.memo ?? null, total: formatAmount(total), currency, due_at: dueAt.toISOString(), line_items: input.line_items, payment: intent };
}

export async function listInvoices(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.invoices).where(eq(schema.invoices.merchantId, ctx.merchantId)).orderBy(desc(schema.invoices.issuedAt)).limit(100);
  const intents = rows.length ? await e.db.select().from(schema.paymentIntents).where(inArray(schema.paymentIntents.id, rows.map((r) => r.paymentIntentId))) : [];
  const views = await loadIntentViews(e, e.db, intents);
  return rows.map((r) => {
    const v = views.find((x) => x.id === r.paymentIntentId)!;
    return { id: r.id, object: "invoice", number: r.number, customer_name: r.customerName, customer_email: r.customerEmail, memo: r.memo, total: v.amount, due_at: r.dueAt.toISOString(), issued_at: r.issuedAt.toISOString(), status: v.status, currency: v.currency, payment_id: v.id, checkout_url: v.checkout_url, line_items: r.lineItems };
  });
}

export async function getInvoice(e: Engine, ctx: AuthContext, id: string) {
  const [r] = await e.db.select().from(schema.invoices).where(and(eq(schema.invoices.id, id), eq(schema.invoices.merchantId, ctx.merchantId)));
  if (!r) throw new EngineError("NOT_FOUND", "Invoice not found", 404);
  const payment = await getPaymentIntent(e, ctx, r.paymentIntentId);
  return { id: r.id, object: "invoice", number: r.number, customer_name: r.customerName, customer_email: r.customerEmail, memo: r.memo, total: payment.amount, currency: payment.currency, due_at: r.dueAt.toISOString(), line_items: r.lineItems, payment };
}
