import { and, asc, eq, inArray, schema, sql, type Executor } from "@plinth/db";
import { quoteFees, type FeeQuote } from "@plinth/blockchain";
import { formatAmount, newId, parseAmount, TOKEN_DECIMALS, TOKEN_SYMBOLS, type TokenSymbol } from "@plinth/shared";
import { encodeFunctionData, getAddress, keccak256, type Address, type Hex } from "viem";
import { audit } from "./audit";
import { requirePermission, type AuthContext } from "./auth";
import { chainOf, EngineError, norm, tokenRuntime, type ChainRuntime, type Engine } from "./context";
import { custodyWithdrawalNotice } from "./email-templates";
import { requireSeasonedUser, verifyReauth, type Reauth } from "./email-verification";
import { notify } from "./payout-config";
import { payoutProofHolds, withdrawalConfig } from "./payout-route";

/**
 * Custodial payouts. The platform's custody wallet holds merchants' funds, and the ledger account CUSTODY_BALANCE says how much
 * of it each merchant may withdraw. This is a trust change compared with every other mode: here the gateway holds funds.
 *
 *   credit:   a final payment on a custodial route credits CUSTODY_BALANCE with the net amount (see ingest.ts)
 *   debit:    a withdrawal request debits it in the same database transaction that creates the request
 *   credit:   a failed or reverted withdrawal credits it back
 *
 * Money only ever leaves the custody wallet to a merchant's proven withdrawal wallet (see withdrawalConfig).
 */

const erc20Transfer = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;

type Withdrawal = typeof schema.custodyWithdrawals.$inferSelect;
const OPEN = ["REQUESTED", "SUBMITTED"];
const PERIOD_MS = { DAILY: 86_400_000, WEEKLY: 7 * 86_400_000 } as const;

const locks = new Map<string, Promise<unknown>>();
/** Serialise custody work per network inside this process (one signer => one nonce sequence). */
function withNetworkLock<T>(networkId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(networkId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(networkId, next);
  return next;
}

const isCustodyOn = (e: Engine, chain: ChainRuntime) => e.cfg.custodyEnabled && !!chain.custody;

function requireCustody(e: Engine, chain: ChainRuntime) {
  if (!isCustodyOn(e, chain)) throw new EngineError("CUSTODY_UNAVAILABLE", `Custodial payouts are not available on ${chain.network.name}.`, 409, { reasons: chain.custodyReasons });
}

function symbolOf(value: string): TokenSymbol {
  if (!(TOKEN_SYMBOLS as readonly string[]).includes(value)) throw new EngineError("UNSUPPORTED_TOKEN", `Unsupported token ${value}`, 400);
  return value as TokenSymbol;
}

// ------------------------------------------------------------------ ledger

/** What a merchant may withdraw now: CUSTODY_BALANCE credits minus debits, per network and token. */
export async function custodyBalance(tx: Executor, merchantId: string, networkId: string, asset: string): Promise<bigint> {
  const [row] = await tx
    .select({ net: sql<string>`coalesce(sum(case when ${schema.ledgerEntries.direction} = 'CREDIT' then ${schema.ledgerEntries.amount} else -${schema.ledgerEntries.amount} end), 0)::text` })
    .from(schema.ledgerEntries)
    .where(and(eq(schema.ledgerEntries.merchantId, merchantId), eq(schema.ledgerEntries.networkId, networkId), eq(schema.ledgerEntries.asset, asset), eq(schema.ledgerEntries.account, "CUSTODY_BALANCE")));
  return BigInt(row?.net ?? "0");
}

async function custodyEntry(tx: Executor, w: { merchantId: string; networkId: string; tokenSymbol: string; id: string }, direction: "CREDIT" | "DEBIT", amount: bigint) {
  await tx
    .insert(schema.ledgerEntries)
    .values({
      id: newId("led"), merchantId: w.merchantId, paymentIntentId: null, networkId: w.networkId, asset: w.tokenSymbol, account: "CUSTODY_BALANCE", direction, amount,
      refType: "custody_withdrawal", refId: w.id, idempotencyKey: `CUSTODY_BALANCE:${w.id}:${direction}`,
    })
    .onConflictDoNothing();
}

// ------------------------------------------------------------------ reading

function view(w: Withdrawal, explorerUrl?: string) {
  return {
    id: w.id,
    object: "custody_withdrawal",
    network: w.networkId,
    token: w.tokenSymbol,
    to: getAddress(w.toAddress),
    amount: formatAmount(w.amount),
    amount_units: w.amount.toString(),
    status: w.status,
    trigger: w.trigger,
    tx_hash: w.txHash,
    explorer_url: w.txHash && explorerUrl ? `${explorerUrl}/tx/${w.txHash}` : null,
    failure_reason: w.status === "FAILED" ? w.lastError : null,
    created_at: w.createdAt.toISOString(),
    confirmed_at: w.confirmedAt?.toISOString() ?? null,
  };
}

/** Per network: whether custody exists, the proven withdrawal wallet, and the balance, pending withdrawals and schedule per token. */
export async function listCustody(e: Engine, ctx: AuthContext) {
  const settings = await e.db.select().from(schema.custodySettings).where(eq(schema.custodySettings.merchantId, ctx.merchantId));
  const open = await e.db.select().from(schema.custodyWithdrawals).where(and(eq(schema.custodyWithdrawals.merchantId, ctx.merchantId), inArray(schema.custodyWithdrawals.status, OPEN)));
  const out = [];
  for (const chain of e.chains.values()) {
    const id = chain.network.id;
    const wallet = await withdrawalConfig(e, e.db, ctx.merchantId, id);
    const tokens = [];
    for (const t of chain.tokens.values()) {
      const balance = await custodyBalance(e.db, ctx.merchantId, id, t.symbol);
      const pending = open.filter((w) => w.networkId === id && w.tokenSymbol === t.symbol).reduce((a, w) => a + w.amount, 0n);
      const st = settings.find((s) => s.networkId === id && s.tokenSymbol === t.symbol);
      tokens.push({
        symbol: t.symbol,
        balance: formatAmount(balance), balance_units: balance.toString(),
        pending_withdrawals: formatAmount(pending), pending_withdrawals_units: pending.toString(),
        schedule: st?.schedule ?? "MANUAL", min_amount: formatAmount(st?.minUnits ?? 0n), last_auto_payout_at: st?.lastAutoPayoutAt?.toISOString() ?? null,
        halted: chain.custodyHalted?.[t.symbol] ?? null,
      });
    }
    out.push({
      network: id, name: chain.network.name, environment: chain.network.environment,
      available: isCustodyOn(e, chain), unavailable_reasons: isCustodyOn(e, chain) ? [] : chain.custodyReasons,
      custody_address: chain.custody ? getAddress(chain.custody.address) : null,
      withdrawal_wallet: wallet?.address ? getAddress(wallet.address) : null,
      tokens,
    });
  }
  return out;
}

export async function listWithdrawals(e: Engine, ctx: AuthContext, limit = 50) {
  const rows = await e.db.select().from(schema.custodyWithdrawals).where(eq(schema.custodyWithdrawals.merchantId, ctx.merchantId)).orderBy(sql`${schema.custodyWithdrawals.createdAt} desc`).limit(limit);
  return rows.map((w) => view(w, e.chains.get(w.networkId)?.network.explorerUrl));
}

// ------------------------------------------------------------------ requests

interface RequestInput {
  network: string;
  token?: string;
  /** Decimal amount in the token; omit for the whole balance. */
  amount?: string;
  reauth?: Reauth;
  idempotencyKey?: string;
}

/** Create a withdrawal and take it out of the balance in one transaction. Shared by manual requests and scheduled payouts. */
async function createWithdrawal(e: Engine, merchantId: string, input: { network: string; token: TokenSymbol; amount?: string; trigger: "MANUAL" | "SCHEDULED"; idempotencyKey: string }): Promise<Withdrawal> {
  const chain = chainOf(e, input.network);
  requireCustody(e, chain);
  if (chain.custodyHalted?.[input.token]) throw new EngineError("CUSTODY_PAUSED", `Withdrawals of ${input.token} are paused while the custody wallet is being checked.`, 503);
  const [existing] = await e.db.select().from(schema.custodyWithdrawals).where(and(eq(schema.custodyWithdrawals.merchantId, merchantId), eq(schema.custodyWithdrawals.idempotencyKey, input.idempotencyKey)));
  if (existing) return existing;

  const cfg = await withdrawalConfig(e, e.db, merchantId, input.network);
  if (!cfg?.address) throw new EngineError("NO_WITHDRAWAL_WALLET", "Set up and confirm a withdrawal wallet before withdrawing.", 409);
  if (!(await payoutProofHolds(cfg, merchantId, chain))) {
    await e.alerts.raise({ key: `payout-proof-invalid:${cfg.id}`, severity: "critical", title: "A custodial withdrawal wallet no longer matches the signature stored for it; the withdrawal was refused", detail: { merchantId, network: input.network, payoutConfigId: cfg.id } });
    throw new EngineError("NO_WITHDRAWAL_WALLET", "The withdrawal wallet could not be verified. Contact support.", 409);
  }

  const id = newId("cwd");
  const row = await e.db.transaction(async (tx) => {
    // Serialise withdrawals per merchant so two requests cannot spend the same balance.
    await tx.select({ id: schema.merchants.id }).from(schema.merchants).where(eq(schema.merchants.id, merchantId)).for("update");
    const balance = await custodyBalance(tx, merchantId, input.network, input.token);
    const amount = input.amount === undefined ? balance : parseAmount(input.amount, TOKEN_DECIMALS, input.token);
    if (amount <= 0n) throw new EngineError("INSUFFICIENT_BALANCE", "There is nothing to withdraw.", 422);
    if (amount > balance) throw new EngineError("INSUFFICIENT_BALANCE", `Your custody balance is ${formatAmount(balance)} ${input.token}.`, 422);
    const [w] = await tx.insert(schema.custodyWithdrawals).values({
      id, merchantId, networkId: input.network, tokenSymbol: input.token, toAddress: norm(cfg.address!), amount, status: "REQUESTED", trigger: input.trigger, idempotencyKey: input.idempotencyKey,
    }).returning();
    await custodyEntry(tx, w!, "DEBIT", amount);
    await audit(tx, { merchantId, actor: input.trigger === "SCHEDULED" ? { type: "SYSTEM" } : { type: "USER" }, action: "custody.withdrawal_requested", targetType: "custody_withdrawal", targetId: id, data: { network: input.network, token: input.token, amount: amount.toString(), to: cfg.address, trigger: input.trigger } });
    return w!;
  });
  await notify(e, merchantId, (to) => custodyWithdrawalNotice(to, { network: chain.network.name, token: input.token, amount: formatAmount(row.amount), address: getAddress(row.toAddress), event: "requested" }));
  return row;
}

/** A merchant asks to withdraw. Needs a fresh sign-in; goes only to the proven withdrawal wallet; idempotent per key. */
export async function requestWithdrawal(e: Engine, ctx: AuthContext, input: RequestInput) {
  requirePermission(ctx, "wallets");
  await requireSeasonedUser(e, ctx);
  await verifyReauth(e, ctx, input.reauth);
  const chain = chainOf(e, input.network);
  requireCustody(e, chain);
  const w = await createWithdrawal(e, ctx.merchantId, { network: input.network, token: symbolOf(input.token ?? "USDC"), amount: input.amount, trigger: "MANUAL", idempotencyKey: input.idempotencyKey ?? newId("cwk") });
  return view(w, chain.network.explorerUrl);
}

/** How a balance is paid out automatically. Changing it needs a fresh sign-in, like withdrawing does. */
export async function setCustodySchedule(e: Engine, ctx: AuthContext, input: { network: string; token?: string; schedule: "MANUAL" | "DAILY" | "WEEKLY"; min_amount?: string; reauth?: Reauth }) {
  requirePermission(ctx, "wallets");
  await requireSeasonedUser(e, ctx);
  await verifyReauth(e, ctx, input.reauth);
  const chain = chainOf(e, input.network);
  requireCustody(e, chain);
  const token = symbolOf(input.token ?? "USDC");
  const minUnits = parseMinimum(input.min_amount ?? "0", token);
  if (input.schedule !== "MANUAL" && !(await withdrawalConfig(e, e.db, ctx.merchantId, input.network))) throw new EngineError("NO_WITHDRAWAL_WALLET", "Set up and confirm a withdrawal wallet before turning on scheduled payouts.", 409);
  await e.db
    .insert(schema.custodySettings)
    .values({ id: newId("cst"), merchantId: ctx.merchantId, networkId: input.network, tokenSymbol: token, schedule: input.schedule, minUnits })
    .onConflictDoUpdate({ target: [schema.custodySettings.merchantId, schema.custodySettings.networkId, schema.custodySettings.tokenSymbol], set: { schedule: input.schedule, minUnits, updatedAt: e.now() } });
  await audit(e.db, { merchantId: ctx.merchantId, actor: ctx.actor, action: "custody.schedule_changed", targetType: "network", targetId: input.network, data: { token, schedule: input.schedule, minUnits: minUnits.toString() } });
  return { network: input.network, token, schedule: input.schedule, min_amount: formatAmount(minUnits) };
}

function parseMinimum(value: string, token: TokenSymbol): bigint {
  return Number(value) === 0 ? 0n : parseAmount(value, TOKEN_DECIMALS, token);
}

// ------------------------------------------------------------------ the worker

/** One pass for a network: reconcile what was sent, check solvency, queue scheduled payouts, send at most one withdrawal. */
export async function custodyTick(e: Engine, networkId: string): Promise<{ confirmed: number; failed: number; submitted: number; scheduled: number }> {
  const chain = e.chains.get(networkId);
  const none = { confirmed: 0, failed: 0, submitted: 0, scheduled: 0 };
  if (!chain || !chain.operational || !isCustodyOn(e, chain)) return none;
  return withNetworkLock(networkId, async () => {
    const r = await reconcileSubmitted(e, chain);
    await checkSolvency(e, chain);
    const scheduled = await runSchedules(e, chain);
    const submitted = await submitNext(e, chain);
    return { ...r, submitted, scheduled };
  });
}

async function reconcileSubmitted(e: Engine, chain: ChainRuntime) {
  const out = { confirmed: 0, failed: 0 };
  const rows = await e.db.select().from(schema.custodyWithdrawals).where(and(eq(schema.custodyWithdrawals.networkId, chain.network.id), eq(schema.custodyWithdrawals.status, "SUBMITTED")));
  if (rows.length === 0) return out;
  const info = await chain.adapter.getHeadInfo();
  for (const w of rows) {
    const receipt = await chain.client.getTransactionReceipt({ hash: w.txHash as Hex }).catch(() => null);
    if (!receipt) {
      // Unknown to the node: broadcast the stored transaction again (same nonce, same hash).
      if (w.rawTx) await chain.client.sendRawTransaction({ serializedTransaction: w.rawTx as Hex }).catch(() => undefined);
      if (w.submittedAt && e.now().getTime() - w.submittedAt.getTime() > 3_600_000) {
        await e.alerts.raise({ key: `custody-stuck:${w.id}`, severity: "critical", title: "A custody withdrawal has not been mined for over an hour", detail: { withdrawalId: w.id, network: w.networkId, txHash: w.txHash } });
      }
      continue;
    }
    if (receipt.status === "success") {
      if (!chain.adapter.isFinal(receipt.blockNumber, info)) continue;
      await e.db.update(schema.custodyWithdrawals).set({ status: "CONFIRMED", confirmedAt: e.now(), gasUsed: receipt.gasUsed, feeNativeWei: receipt.gasUsed * receipt.effectiveGasPrice, lastError: null }).where(and(eq(schema.custodyWithdrawals.id, w.id), eq(schema.custodyWithdrawals.status, "SUBMITTED")));
      await audit(e.db, { merchantId: w.merchantId, actor: { type: "SYSTEM" }, action: "custody.withdrawal_confirmed", targetType: "custody_withdrawal", targetId: w.id, data: { txHash: w.txHash } });
      await notify(e, w.merchantId, (to) => custodyWithdrawalNotice(to, { network: chain.network.name, token: w.tokenSymbol, amount: formatAmount(w.amount), address: getAddress(w.toAddress), event: "confirmed", txHash: w.txHash }));
      out.confirmed++;
    } else {
      await failWithdrawal(e, chain, w, "the transfer reverted on-chain");
      out.failed++;
    }
  }
  return out;
}

/** A withdrawal that did not move funds: mark it failed and put the amount back in the balance, once. */
async function failWithdrawal(e: Engine, chain: ChainRuntime, w: Withdrawal, reason: string) {
  await e.db.transaction(async (tx) => {
    const done = await tx.update(schema.custodyWithdrawals).set({ status: "FAILED", lastError: reason }).where(and(eq(schema.custodyWithdrawals.id, w.id), inArray(schema.custodyWithdrawals.status, OPEN))).returning({ id: schema.custodyWithdrawals.id });
    if (done.length === 0) return;
    await custodyEntry(tx, w, "CREDIT", w.amount);
    await audit(tx, { merchantId: w.merchantId, actor: { type: "SYSTEM" }, action: "custody.withdrawal_failed", targetType: "custody_withdrawal", targetId: w.id, data: { reason } });
  });
  await e.alerts.raise({ key: `custody-withdrawal-failed:${w.id}`, severity: "warning", title: "A custody withdrawal failed and was credited back", detail: { withdrawalId: w.id, network: w.networkId, reason } });
  await notify(e, w.merchantId, (to) => custodyWithdrawalNotice(to, { network: chain.network.name, token: w.tokenSymbol, amount: formatAmount(w.amount), address: getAddress(w.toAddress), event: "failed" }));
}

/**
 * The custody wallet must hold at least what it owes: every merchant's balance plus withdrawals still on their way.
 * If it does not, no new withdrawal is sent for that token until it does, and the alert is critical.
 */
async function checkSolvency(e: Engine, chain: ChainRuntime) {
  chain.custodyHalted = chain.custodyHalted ?? {};
  for (const t of chain.tokens.values()) {
    const [bal] = await e.db
      .select({ net: sql<string>`coalesce(sum(case when ${schema.ledgerEntries.direction} = 'CREDIT' then ${schema.ledgerEntries.amount} else -${schema.ledgerEntries.amount} end), 0)::text` })
      .from(schema.ledgerEntries)
      .where(and(eq(schema.ledgerEntries.networkId, chain.network.id), eq(schema.ledgerEntries.asset, t.symbol), eq(schema.ledgerEntries.account, "CUSTODY_BALANCE")));
    const [open] = await e.db
      .select({ sum: sql<string>`coalesce(sum(${schema.custodyWithdrawals.amount}), 0)::text` })
      .from(schema.custodyWithdrawals)
      .where(and(eq(schema.custodyWithdrawals.networkId, chain.network.id), eq(schema.custodyWithdrawals.tokenSymbol, t.symbol), eq(schema.custodyWithdrawals.status, "SUBMITTED")));
    const owed = BigInt(bal?.net ?? "0") + BigInt(open?.sum ?? "0");
    const held = await t.adapter.tokenBalanceOf(chain.custody!.address);
    if (held < owed) {
      chain.custodyHalted[t.symbol] = `the custody wallet holds ${formatAmount(held)} ${t.symbol} but owes ${formatAmount(owed)}`;
      await e.alerts.raise({ key: `custody-insolvent:${chain.network.id}:${t.symbol}`, severity: "critical", title: `The custody wallet holds less ${t.symbol} than merchants are owed; withdrawals are paused`, detail: { network: chain.network.id, token: t.symbol, heldUnits: held.toString(), owedUnits: owed.toString() } });
    } else {
      delete chain.custodyHalted[t.symbol];
    }
  }
}

/** Scheduled payouts: the whole balance in ONE withdrawal per merchant, network and token, once per period. */
async function runSchedules(e: Engine, chain: ChainRuntime): Promise<number> {
  const rows = await e.db.select().from(schema.custodySettings).where(and(eq(schema.custodySettings.networkId, chain.network.id), inArray(schema.custodySettings.schedule, ["DAILY", "WEEKLY"])));
  let made = 0;
  const now = e.now().getTime();
  for (const s of rows) {
    const period = PERIOD_MS[s.schedule as "DAILY" | "WEEKLY"];
    if (s.lastAutoPayoutAt && now - s.lastAutoPayoutAt.getTime() < period) continue;
    if (chain.custodyHalted?.[s.tokenSymbol]) continue;
    const token = s.tokenSymbol as TokenSymbol;
    const [pending] = await e.db.select({ id: schema.custodyWithdrawals.id }).from(schema.custodyWithdrawals).where(and(eq(schema.custodyWithdrawals.merchantId, s.merchantId), eq(schema.custodyWithdrawals.networkId, s.networkId), eq(schema.custodyWithdrawals.tokenSymbol, token), inArray(schema.custodyWithdrawals.status, OPEN))).limit(1);
    if (pending) continue;
    const balance = await custodyBalance(e.db, s.merchantId, s.networkId, token);
    if (balance <= 0n || balance < s.minUnits) continue;
    try {
      await createWithdrawal(e, s.merchantId, { network: s.networkId, token, trigger: "SCHEDULED", idempotencyKey: `auto:${s.networkId}:${token}:${Math.floor(now / period)}` });
      await e.db.update(schema.custodySettings).set({ lastAutoPayoutAt: e.now() }).where(eq(schema.custodySettings.id, s.id));
      made++;
    } catch (err) {
      e.log.warn("scheduled custody payout skipped", { merchantId: s.merchantId, network: s.networkId, err: err instanceof Error ? err.message.slice(0, 160) : String(err) });
    }
  }
  return made;
}

/** Send the oldest waiting withdrawal, one at a time per network: simulate, honour the fee cap, persist the signed transaction, then broadcast. */
async function submitNext(e: Engine, chain: ChainRuntime): Promise<number> {
  const net = chain.network;
  const custody = chain.custody!;
  const [inFlight] = await e.db.select({ id: schema.custodyWithdrawals.id }).from(schema.custodyWithdrawals).where(and(eq(schema.custodyWithdrawals.networkId, net.id), eq(schema.custodyWithdrawals.status, "SUBMITTED"))).limit(1);
  if (inFlight) return 0;
  const waiting = await e.db.select().from(schema.custodyWithdrawals).where(and(eq(schema.custodyWithdrawals.networkId, net.id), eq(schema.custodyWithdrawals.status, "REQUESTED"), sql`${schema.custodyWithdrawals.nextAttemptAt} <= ${e.now()}`)).orderBy(asc(schema.custodyWithdrawals.createdAt)).limit(10);
  const w = waiting.find((x) => !chain.custodyHalted?.[x.tokenSymbol]);
  if (!w) return 0;

  const token = tokenRuntime(chain, w.tokenSymbol as TokenSymbol, { open: false });
  const data = encodeFunctionData({ abi: erc20Transfer, functionName: "transfer", args: [getAddress(w.toAddress) as Address, w.amount] });
  const to = token.config.address;
  const defer = async (ms: number, why: string) => {
    await e.db.update(schema.custodyWithdrawals).set({ nextAttemptAt: new Date(e.now().getTime() + ms), lastError: why }).where(eq(schema.custodyWithdrawals.id, w.id));
  };

  let gas: bigint;
  try {
    gas = await chain.client.estimateGas({ account: custody.address, to, data });
  } catch (err) {
    // A transfer that would revert (blocked recipient, paused token) moves nothing: fail it and give the balance back.
    await failWithdrawal(e, chain, w, `simulation reverted: ${shortError(err)}`);
    return 0;
  }
  gas = (gas * 130n) / 100n + 10_000n;
  const fees: FeeQuote = await quoteFees(chain.client, net);
  const maxCost = gas * fees.maxFeePerGas;
  if (maxCost > chain.policy.maxFeePerTxWei) {
    await e.alerts.raise({ key: `custody-fee-cap:${net.id}`, severity: "warning", title: "Network fees exceed the per-transaction cap; a custody withdrawal was deferred", detail: { network: net.id, maxCostWei: maxCost.toString(), capWei: chain.policy.maxFeePerTxWei.toString() } });
    await defer(60_000, "deferred: network fees above the cap");
    return 0;
  }
  const native = await chain.client.getBalance({ address: custody.address });
  if (native < maxCost + chain.policy.minBalanceWei) {
    await e.alerts.raise({ key: `custody-gas-low:${net.id}`, severity: "critical", title: "The custody wallet has too little gas to send withdrawals", detail: { network: net.id, balanceWei: native.toString(), custody: custody.address } });
    await defer(60_000, "deferred: the custody wallet needs gas");
    return 0;
  }

  const pending = BigInt(await chain.client.getTransactionCount({ address: custody.address, blockTag: "pending" }));
  const raw = await custody.signTransaction({ type: "eip1559", chainId: net.chainId, nonce: Number(pending), to, data, gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0n });
  const hash = keccak256(raw);
  // Persist BEFORE broadcasting so a crash cannot lose track of a transaction that may land.
  await e.db.update(schema.custodyWithdrawals).set({
    status: "SUBMITTED", signerAddress: norm(custody.address), nonce: pending, rawTx: raw, txHash: hash, gasLimit: gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    submittedAt: e.now(), attempts: w.attempts + 1, lastError: null,
  }).where(eq(schema.custodyWithdrawals.id, w.id));
  try {
    await chain.client.sendRawTransaction({ serializedTransaction: raw });
    return 1;
  } catch (err) {
    const msg = shortError(err);
    if (/already known|known transaction|already imported/i.test(msg)) return 1;
    // The node did not accept it: release it and retry later.
    await e.db.update(schema.custodyWithdrawals).set({ status: "REQUESTED", nonce: null, rawTx: null, txHash: null, lastError: `broadcast rejected: ${msg}`, nextAttemptAt: new Date(e.now().getTime() + 15_000 * 2 ** Math.min(w.attempts, 5)) }).where(eq(schema.custodyWithdrawals.id, w.id));
    e.log.warn("custody broadcast rejected", { withdrawalId: w.id, err: msg });
    return 0;
  }
}

function shortError(err: unknown): string {
  return (err instanceof Error ? (err as { shortMessage?: string }).shortMessage ?? err.message : String(err)).replace(/\s+/g, " ").slice(0, 200);
}
