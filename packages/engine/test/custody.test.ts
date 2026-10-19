import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, schema } from "@plinth/db";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import { computeFee, parseUsdc } from "@plinth/shared";
import { getAddress, type Address } from "viem";
import {
  confirmEmailLink,
  confirmPayoutLink,
  createPayoutChallenge,
  createPaymentIntent,
  custodyBalance,
  custodyTick,
  enableNetwork,
  listCustody,
  listPayoutMethods,
  listWithdrawals,
  paymentDetail,
  requestEmailVerification,
  requestPayoutWallet,
  requestRefund,
  requestWithdrawal,
  setCustodySchedule,
  signup,
  switchToVault,
  type AuthContext,
} from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
const PASSWORD = "a-long-password-for-tests-1";
const tokenFrom = (link: string) => new URL(link).searchParams.get("token")!;
const input = (amount: string) => ({ amount, currency: "USDC" as const, checkout_methods: ["ADDRESS"] as ("WALLET" | "ADDRESS")[], expires_in_seconds: 3600 });
const wallet = (i: number) => h.chain.accounts[i]!;
const custodyAddress = () => getAddress(h.chain.accounts[4]!.address);
const bal = (a: Address) => h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(a);
const treasury = () => h.chain.treasury;
const ledgerFor = (merchantId: string, account: string) => h.engine.db.select().from(schema.ledgerEntries).where(and(eq(schema.ledgerEntries.merchantId, merchantId), eq(schema.ledgerEntries.account, account)));
const balanceOf = (m: Merchant) => custodyBalance(h.engine.db, m.merchantId, h.net, "USDC");

interface Merchant { ctx: AuthContext; email: string; merchantId: string }
let seq = 0;

/** A merchant with a verified email and a confirmed custodial setup whose withdrawal wallet is `who`. No vault. */
async function custodialMerchant(who = wallet(6)): Promise<Merchant> {
  const m = await plainMerchant();
  await setUpCustodial(m, who);
  return m;
}

async function plainMerchant(): Promise<Merchant> {
  const email = `cust${++seq}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { merchantId, userId } = await signup(h.engine, { business_name: "Custody Co", email, password: PASSWORD }, { type: "SYSTEM" });
  const ctx: AuthContext = { merchantId, environment: "test", actor: { type: "USER", id: userId }, role: "OWNER", via: "session" };
  await requestEmailVerification(h.engine, ctx);
  await confirmEmailLink(h.engine, tokenFrom(h.mail.linkTo(email)!));
  return { ctx, email, merchantId };
}

async function setUpCustodial(m: Merchant, who: ReturnType<typeof wallet>) {
  const ch = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: who.address, purpose: "CUSTODY_WITHDRAWAL" });
  const signature = await who.signMessage({ message: ch.message });
  const pending = await requestPayoutWallet(h.engine, m.ctx, { network: h.net, mode: "CUSTODIAL", address: who.address, nonce: ch.nonce, signature, reauth: { password: PASSWORD } });
  expect(pending).toMatchObject({ mode: "CUSTODIAL", status: "PENDING_CONFIRMATION" });
  await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
}

/** Create a custodial payment, pay it from the customer wallet, and wait until it is settled. */
async function payAndSettle(m: Merchant, amount: string) {
  const pi = await createPaymentIntent(h.engine, m.ctx, input(amount));
  await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc(amount));
  await h.pump(8);
  expect((await paymentDetail(h.engine, m.ctx, pi.id)).status).toBe("SETTLED");
  return pi;
}

beforeAll(async () => {
  h = await startHarness({ confirmations: 2, custody: true });
}, 120_000);
afterAll(async () => h.stop());

describe("paying into custody", () => {
  it("a custodial payment goes to the custody wallet and the net amount is credited to the merchant's balance", async () => {
    const m = await custodialMerchant();
    const before = await bal(custodyAddress());
    const treasuryBefore = await bal(treasury());
    const pi = await createPaymentIntent(h.engine, m.ctx, input("100.00"));
    // On-chain this is an ordinary DIRECT address whose destination is the custody wallet.
    const [addr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, pi.id));
    expect(addr).toMatchObject({ destinationKind: "DIRECT", custodial: true, destinationAddress: custodyAddress().toLowerCase() });
    const [route] = await h.engine.db.select().from(schema.paymentIntentRoutes).where(eq(schema.paymentIntentRoutes.paymentIntentId, pi.id));
    expect(route).toMatchObject({ custodial: true, destinationKind: "DIRECT" });

    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("100"));
    await h.pump(8);
    const fee = computeFee(parseUsdc("100"), 20);
    expect((await paymentDetail(h.engine, m.ctx, pi.id)).status).toBe("SETTLED");
    expect((await bal(custodyAddress())) - before).toBe(parseUsdc("100") - fee);
    expect((await bal(treasury())) - treasuryBefore).toBe(fee);
    expect(await balanceOf(m)).toBe(parseUsdc("100") - fee);
    expect((await ledgerFor(m.merchantId, "SETTLED_TO_CUSTODY")).map((l) => l.amount)).toEqual([parseUsdc("100") - fee]);
    expect(await ledgerFor(m.merchantId, "SETTLED_TO_WALLET")).toHaveLength(0);
    expect(await ledgerFor(m.merchantId, "SETTLED_TO_VAULT")).toHaveLength(0);
  });

  it("is a different mode from a payout wallet: the withdrawal wallet receives nothing from a payment", async () => {
    const who = wallet(7);
    const m = await custodialMerchant(who);
    const before = await bal(who.address);
    await payAndSettle(m, "10.00");
    expect(await bal(who.address)).toBe(before);
    const list = (await listPayoutMethods(h.engine, m.ctx)).find((x) => x.network === h.net)!;
    expect(list).toMatchObject({ mode: "CUSTODIAL", destination: custodyAddress(), withdrawal_wallet: getAddress(who.address), custody_available: true });
  });

  it("the custody wallet, the relayer and the treasury can never be a withdrawal wallet", async () => {
    const m = await plainMerchant();
    for (const bad of [custodyAddress(), getAddress(wallet(1).address), getAddress(h.chain.treasury)]) {
      await expect(createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: bad, purpose: "CUSTODY_WITHDRAWAL" })).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
    }
  });
});

describe("withdrawing", () => {
  it("a withdrawal is debited at once, sent to the proven wallet, confirmed, and repeating the request changes nothing", async () => {
    const who = wallet(6);
    const m = await custodialMerchant(who);
    await payAndSettle(m, "50.00");
    const net = parseUsdc("50") - computeFee(parseUsdc("50"), 20);
    const walletBefore = await bal(who.address);

    const w = await requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD }, idempotencyKey: "w-1" });
    expect(w).toMatchObject({ status: "REQUESTED", amount_units: net.toString(), to: getAddress(who.address) });
    expect(await balanceOf(m)).toBe(0n);
    // Asking again with the same key is the same withdrawal, not a second one.
    expect((await requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD }, idempotencyKey: "w-1" })).id).toBe(w.id);
    // Nothing is left to withdraw.
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD }, idempotencyKey: "w-2" })).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });

    await h.pump(6);
    const [row] = await listWithdrawals(h.engine, m.ctx);
    expect(row).toMatchObject({ id: w.id, status: "CONFIRMED" });
    expect(row!.tx_hash).toMatch(/^0x/);
    expect((await bal(who.address)) - walletBefore).toBe(net);
    expect(await balanceOf(m)).toBe(0n);
    expect(h.mail.to(m.email).map((x) => x.subject)).toEqual(expect.arrayContaining(["A custody withdrawal was requested", "A custody withdrawal was sent"]));
  });

  it("a memo contract that is not on the chain never stops a payout: the plain transfer is used", async () => {
    const network = h.engine.chains.get(h.net)!.network;
    const before = network.memoContract;
    network.memoContract = getAddress("0x00000000000000000000000000000000000d3ad0"); // no code there: a call to it would "succeed" and move nothing
    try {
      const who = wallet(7);
      const m = await custodialMerchant(who);
      await payAndSettle(m, "12.00");
      const net = parseUsdc("12") - computeFee(parseUsdc("12"), 20);
      const walletBefore = await bal(who.address);
      await requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD }, idempotencyKey: "memo-fallback" });
      await h.pump(6);
      expect((await listWithdrawals(h.engine, m.ctx))[0]).toMatchObject({ status: "CONFIRMED" });
      expect((await bal(who.address)) - walletBefore).toBe(net);
    } finally {
      network.memoContract = before;
    }
  });

  it("a part of the balance can be withdrawn, and a withdrawal needs a fresh sign-in", async () => {
    const m = await custodialMerchant();
    await payAndSettle(m, "20.00");
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", amount: "5.00" })).rejects.toBeTruthy();
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", amount: "5.00", reauth: { password: "wrong password for sure" } })).rejects.toBeTruthy();
    await requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", amount: "5.00", reauth: { password: PASSWORD } });
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", amount: "500.00", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(await balanceOf(m)).toBe(parseUsdc("20") - computeFee(parseUsdc("20"), 20) - parseUsdc("5"));
    await h.pump(6);
  });

  it("is refused without a confirmed withdrawal wallet", async () => {
    const m = await plainMerchant();
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "NO_WITHDRAWAL_WALLET" });
    // A wallet that is requested but not yet confirmed by email is not enough.
    const ch = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: wallet(6).address, purpose: "CUSTODY_WITHDRAWAL" });
    await requestPayoutWallet(h.engine, m.ctx, { network: h.net, mode: "CUSTODIAL", address: wallet(6).address, nonce: ch.nonce, signature: await wallet(6).signMessage({ message: ch.message }), reauth: { password: PASSWORD } });
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "NO_WITHDRAWAL_WALLET" });
    await expect(setCustodySchedule(h.engine, m.ctx, { network: h.net, token: "USDC", schedule: "DAILY", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "NO_WITHDRAWAL_WALLET" });
  });

  it("a balance can still be withdrawn to the proven wallet after the merchant switches the payout mode", async () => {
    const who = wallet(6);
    const m = await custodialMerchant(who);
    await enableNetwork(h.engine, m.ctx, { network: h.net, owner_address: wallet(2).address });
    await h.pump(2);
    await payAndSettle(m, "30.00");
    await switchToVault(h.engine, m.ctx, { network: h.net, reauth: { password: PASSWORD } });
    const [after] = await createPaymentIntent(h.engine, m.ctx, input("1.00")).then((p) => h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, p.id)));
    expect(after).toMatchObject({ destinationKind: "VAULT", custodial: false });
    const before = await bal(who.address);
    const w = await requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD } });
    await h.pump(6);
    expect((await bal(who.address)) - before).toBe(BigInt(w.amount_units));
  });

  it("a transfer that cannot be made is failed and the balance is credited back", async () => {
    const who = wallet(5);
    const m = await custodialMerchant(who);
    await payAndSettle(m, "40.00");
    const held = await balanceOf(m);
    const call = (fn: "blacklist" | "unBlacklist") => h.chain.walletFor(0).writeContract({ address: h.chain.usdc, abi: MockFiatTokenAbi, functionName: fn, args: [who.address], account: wallet(0), chain: undefined });
    // The issuer blocks the wallet after it was proven: the transfer would revert, so nothing is sent.
    await call("blacklist");
    try {
      const w = await requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD } });
      expect(await balanceOf(m)).toBe(0n);
      await h.pump(4);
      const [row] = await listWithdrawals(h.engine, m.ctx);
      expect(row).toMatchObject({ id: w.id, status: "FAILED" });
      expect(row!.failure_reason).toMatch(/revert/);
      expect(await balanceOf(m)).toBe(held);
      expect(h.alerts.alerts.some((a) => a.key === `custody-withdrawal-failed:${w.id}`)).toBe(true);
      // Credited back exactly once, however many times the worker runs.
      await h.pump(3);
      expect(await balanceOf(m)).toBe(held);
    } finally {
      await call("unBlacklist");
    }
  });
});

describe("scheduled payouts", () => {
  it("the whole balance goes out in one transfer per period, only above the minimum, and not twice in a period", async () => {
    const who = wallet(6);
    const m = await custodialMerchant(who);
    await payAndSettle(m, "10.00");
    await payAndSettle(m, "15.00");
    const total = parseUsdc("25") - computeFee(parseUsdc("10"), 20) - computeFee(parseUsdc("15"), 20);
    expect(await balanceOf(m)).toBe(total);

    // Below the minimum: nothing is sent.
    await setCustodySchedule(h.engine, m.ctx, { network: h.net, token: "USDC", schedule: "DAILY", min_amount: "1000", reauth: { password: PASSWORD } });
    await h.pump(3);
    expect(await listWithdrawals(h.engine, m.ctx)).toHaveLength(0);

    await setCustodySchedule(h.engine, m.ctx, { network: h.net, token: "USDC", schedule: "DAILY", min_amount: "5", reauth: { password: PASSWORD } });
    const before = await bal(who.address);
    await h.pump(6);
    const list = await listWithdrawals(h.engine, m.ctx);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ trigger: "SCHEDULED", status: "CONFIRMED", amount_units: total.toString() });
    expect((await bal(who.address)) - before).toBe(total);

    // The same period: a new payment waits for the next one.
    await payAndSettle(m, "20.00");
    await h.pump(3);
    expect(await listWithdrawals(h.engine, m.ctx)).toHaveLength(1);
    h.clock.offsetMs += 25 * 3_600_000;
    await h.pump(6);
    expect(await listWithdrawals(h.engine, m.ctx)).toHaveLength(2);
    expect(await balanceOf(m)).toBe(0n);
  });
});

describe("solvency", () => {
  it("withdrawals pause, with a critical alert, when the custody wallet holds less than merchants are owed, and resume when it is topped up", async () => {
    const m = await custodialMerchant();
    await payAndSettle(m, "60.00");
    // Someone with the custody key takes tokens out of the wallet without a withdrawal.
    const hash = await h.chain.walletFor(4).writeContract({ address: h.chain.usdc, abi: MockFiatTokenAbi, functionName: "transfer", args: [wallet(0).address, (await bal(custodyAddress()))], account: wallet(4), chain: undefined });
    await h.chain.publicClient.waitForTransactionReceipt({ hash });
    await custodyTick(h.engine, h.net);
    expect(h.alerts.alerts.some((a) => a.key === `custody-insolvent:${h.net}:USDC` && a.severity === "critical")).toBe(true);
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "CUSTODY_PAUSED" });
    expect((await listCustody(h.engine, m.ctx)).find((n) => n.network === h.net)!.tokens.find((t) => t.symbol === "USDC")!.halted).toMatch(/owes/);

    // The wallet owes every merchant in this file, not only this one: top it up well above that.
    await h.chain.mintUsdc(custodyAddress(), parseUsdc("100000"));
    await custodyTick(h.engine, h.net);
    await expect(requestWithdrawal(h.engine, m.ctx, { network: h.net, token: "USDC", reauth: { password: PASSWORD } })).resolves.toMatchObject({ status: "REQUESTED" });
    await h.pump(6);
  });
});

describe("what custody does not do yet", () => {
  it("refunds of a custodial payment are refused with a clear reason", async () => {
    const m = await custodialMerchant();
    const pi = await payAndSettle(m, "12.00");
    await expect(requestRefund(h.engine, m.ctx, { payment_intent_id: pi.id, amount: "5.00", recipient: wallet(3).address })).rejects.toMatchObject({ code: "REFUND_UNSUPPORTED_CUSTODIAL" });
  });
});

describe("when custody is switched off", () => {
  it("nobody can enter custodial mode and no address is derived for a custodial config", async () => {
    const off = await startHarness({ confirmations: 2 });
    try {
      const email = "off-custody@example.com";
      const { merchantId, userId } = await signup(off.engine, { business_name: "Off Co", email, password: PASSWORD }, { type: "SYSTEM" });
      const ctx: AuthContext = { merchantId, environment: "test", actor: { type: "USER", id: userId }, role: "OWNER", via: "session" };
      await requestEmailVerification(off.engine, ctx);
      await confirmEmailLink(off.engine, tokenFrom(off.mail.linkTo(email)!));
      await expect(createPayoutChallenge(off.engine, ctx, { network: off.net, address: off.chain.accounts[6]!.address, purpose: "CUSTODY_WITHDRAWAL" })).rejects.toMatchObject({ code: "CUSTODY_UNAVAILABLE" });
      await expect(requestPayoutWallet(off.engine, ctx, { network: off.net, mode: "CUSTODIAL", address: off.chain.accounts[6]!.address, nonce: "x".repeat(16), signature: "0x" + "11".repeat(65), reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "CUSTODY_UNAVAILABLE" });
      await expect(requestWithdrawal(off.engine, ctx, { network: off.net, token: "USDC", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "CUSTODY_UNAVAILABLE" });
      expect((await listCustody(off.engine, ctx)).find((n) => n.network === off.net)).toMatchObject({ available: false, custody_address: null });
      expect(await custodyTick(off.engine, off.net)).toEqual({ confirmed: 0, failed: 0, submitted: 0, scheduled: 0 });
    } finally {
      await off.stop();
    }
  });
});
