/**
 * Sample data for the public dashboard demo (/demo).
 *
 * ISOLATION: this module is imported ONLY by lib/demo-source.ts and app/demo/**. The real dashboard
 * (app/dashboard, components/dashboard, components/shell, lib/hooks, lib/data-source) must never reach
 * it. scripts/check-demo-isolation.mjs enforces that.
 *
 * Everything here is fictional: one invented merchant, invented customers on reserved ".example"
 * domains, and addresses/hashes that all start with the marker 0xd3d0 so nobody can mistake them for
 * real on-chain data. The dataset is generated from a fixed seed, so its shape is stable; timestamps
 * are anchored to the current hour so the sample always looks recent.
 *
 * Every aggregate (overview, charts, vault balances, settlement and transaction lists, webhook log)
 * is derived from the one payments list below, so the pages agree with each other.
 */

// ───────────────────────────────────────────────────────────── seeded randomness

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const DEMO_MERCHANT_NAME = "Northwind Coffee Roasters";
export const DEMO_USER_EMAIL = "owner@northwind.example";

// ───────────────────────────────────────────────────────────── types (loose on purpose: mirrors API JSON)

type Json = Record<string, any>;

export interface DemoDataset {
  anchor: number;
  me: Json;
  networks: Json[];
  vaults: Record<string, Json>;
  payments: Json[];
  transactions: Json[];
  settlements: Json[];
  refundRequests: Json[];
  paymentLinks: Json[];
  invoices: Json[];
  apiKeys: Json[];
  webhookEndpoints: Json[];
  webhookDeliveries: Json[];
  deliveryAttempts: Record<string, Json[]>;
  team: Json[];
  policy: Json;
  audit: Json[];
}

// ───────────────────────────────────────────────────────────── builders

const NETS = {
  "arc-testnet": {
    id: "arc-testnet", chain_id: 5042, name: "Arc", usdc: "0x3600000000000000000000000000000000000000",
    gas_model: "usdc-native", native: { symbol: "USDC", decimals: 18 }, finality: { strategy: "confirmations", confirmations: 1 }, cctp: 26, confs: 3,
  },
  "base-sepolia": {
    id: "base-sepolia", chain_id: 8453, name: "Base", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    gas_model: "eth", native: { symbol: "ETH", decimals: 18 }, finality: { strategy: "finalized-tag", confirmations: 0 }, cctp: 6, confs: 24,
  },
} as const;
type NetId = keyof typeof NETS;

const iso = (ms: number) => new Date(ms).toISOString();
const money = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
const units = (cents: number) => String(cents * 10_000);

type Status =
  | "SETTLED" | "OVERPAID" | "UNDERPAID" | "EXPIRED" | "LATE_PAYMENT" | "REFUND_REQUESTED" | "PARTIALLY_REFUNDED" | "REFUNDED"
  | "SETTLEMENT_PENDING" | "CONFIRMING" | "DETECTED" | "AWAITING_PAYMENT" | "SETTLEMENT_FAILED" | "INVALID_ASSET";

/** The lifecycle mix of the 52 sample payments. */
const MIX: Status[] = [
  ...Array<Status>(30).fill("SETTLED"),
  "OVERPAID", "OVERPAID",
  "UNDERPAID", "UNDERPAID", "UNDERPAID",
  ...Array<Status>(5).fill("EXPIRED"),
  "LATE_PAYMENT", "LATE_PAYMENT",
  "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED",
  "SETTLEMENT_PENDING", "CONFIRMING", "DETECTED", "AWAITING_PAYMENT", "AWAITING_PAYMENT",
  "SETTLEMENT_FAILED", "INVALID_ASSET",
];
const OPEN: Status[] = ["SETTLEMENT_PENDING", "CONFIRMING", "DETECTED", "AWAITING_PAYMENT"];

const CATALOG: [string, number][] = [
  ["Ethiopia Guji, 1 kg", 3400], ["Espresso blend, 5 kg", 11800], ["Decaf, 3 kg", 6425], ["Cafe account, weekly", 41000],
  ["Brew class, 2 seats", 9000], ["Gift box, medium", 4800], ["Subscription, monthly", 2600], ["Grinder bundle", 18900],
  ["Cold brew kegs, 2x", 24000], ["Office beans, 10 kg", 21500],
];

const CUSTOMERS: [string, string][] = [
  ["Harbor Street Cafe", "billing@harborstreet.example"], ["Juniper Bakery", "accounts@juniperbakery.example"],
  ["Fernhill Office Supply", "ap@fernhill.example"], ["Lowtide Catering", "pay@lowtide.example"],
  ["Pine Row Hotel", "finance@pinerow.example"], ["Meridian Co-working", "bills@meridian.example"],
  ["Alder Books", "hello@alderbooks.example"], ["Teahouse on Fourth", "orders@teahouse4th.example"],
];

let cache: DemoDataset | null = null;

/** Builds (once per anchor hour) the whole sample dataset. */
export function getDemoDataset(): DemoDataset {
  const anchor = Math.floor(Date.now() / HOUR) * HOUR;
  if (cache && cache.anchor === anchor) return cache;
  cache = build(anchor);
  return cache;
}

function build(anchor: number): DemoDataset {
  const rnd = mulberry32(20261011);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join("");
  const addr = () => `0xd3d0${hex(36)}`;
  const txHash = () => `0xd3d0${hex(60)}`;
  const id = (p: string) => `${p}_${hex(32)}`;

  const netIds = Object.keys(NETS) as NetId[];
  const vaultAddr = Object.fromEntries(netIds.map((n) => [n, addr()])) as Record<NetId, string>;
  const ownerAddr = addr();
  const payoutAddr = addr();
  const relayer = addr();

  // ── payments
  const statuses = [...MIX];
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j]!, statuses[i]!];
  }
  const specs = statuses.map((status) => {
    let createdAt: number;
    if (OPEN.includes(status)) createdAt = anchor - between(4, 38) * MIN;
    else if (status === "SETTLEMENT_FAILED") createdAt = anchor - between(5, 20) * HOUR;
    else if (status === "REFUND_REQUESTED") createdAt = anchor - between(2, 9) * DAY - between(0, 10) * HOUR;
    else createdAt = anchor - between(3, 29 * 24) * HOUR - between(0, 59) * MIN;
    const [desc, base] = pick(CATALOG);
    const qty = rnd() < 0.25 ? 2 : 1;
    return { status, createdAt, desc, cents: base * qty, net: (rnd() < 0.7 ? "arc-testnet" : "base-sepolia") as NetId, wallet: rnd() < 0.25, kindRoll: rnd() };
  });
  specs.sort((a, b) => a.createdAt - b.createdAt);

  const payments: Json[] = [];
  const transactions: Json[] = [];
  const settlements: Json[] = [];
  const refundRequests: Json[] = [];

  specs.forEach((s, idx) => {
    const n = NETS[s.net];
    const pid = id("pi");
    const kind = s.kindRoll < 0.7 ? "PAYMENT_INTENT" : s.kindRoll < 0.85 ? "INVOICE" : "PAYMENT_LINK";
    const cust = kind === "INVOICE" ? pick(CUSTOMERS) : null;
    const expires = s.createdAt + HOUR;
    const payer = addr();
    const deposit: Record<string, string> = Object.fromEntries(netIds.map((x) => [x, addr()]));
    const timeline: Json[] = [];
    const ev = (type: string, at: number, data: Json = {}) => timeline.push({ id: id("pev"), type, data, at: iso(at) });
    const change = (from: string, to: string, at: number) => ev("status.changed", at, { from, to });
    const txs: Json[] = [];
    const sts: Json[] = [];
    const refunds: Json[] = [];

    let amountCents = s.cents;
    let received = 0, pending = 0, settled = 0, refunded = 0, excess = 0;
    let paidAt = null as number | null;
    let settledAt = null as number | null;
    const status = s.status;
    const wallet = s.wallet && !["UNDERPAID", "LATE_PAYMENT", "INVALID_ASSET", "SETTLEMENT_PENDING", "SETTLEMENT_FAILED", "PARTIALLY_REFUNDED", "REFUND_REQUESTED", "REFUNDED"].includes(status);

    ev("created", s.createdAt, { networks: netIds, amount_units: units(amountCents) });

    const incoming = (cents: number, at: number, st: "DETECTED" | "CONFIRMING" | "FINAL", official = true) => {
      const hash = txHash();
      const confs = st === "FINAL" ? n.confs : st === "CONFIRMING" ? 1 : 0;
      const t = {
        id: id("tx"), kind: wallet ? "WALLET_PAYMENT" : "INCOMING_TRANSFER", network: s.net, tx_hash: hash, log_index: between(0, 6), status: st, official_asset: official,
        token: official ? n.usdc : addr(), from: payer, to: wallet ? vaultAddr[s.net] : deposit[s.net]!, amount: money(cents), amount_units: units(cents),
        block_number: String(between(1_200_000, 1_900_000)), confirmations: confs, block_time: iso(at), seen_at: iso(at), explorer_url: null, payment_intent_id: pid,
      };
      txs.push(t);
      transactions.push(t);
      return t;
    };
    const sweep = (cents: number, at: number, attemptStatus: "CONFIRMED" | "SUBMITTED" | "FAILED") => {
      const hash = attemptStatus === "FAILED" ? null : txHash();
      const feeUsdc = n.gas_model === "usdc-native" ? "0.01" : null;
      const sttl = {
        id: id("stl"), object: "settlement", payment_intent_id: pid, network: s.net, kind: "SWEEP", status: attemptStatus, attempt: 1, vault: vaultAddr[s.net], destination: vaultAddr[s.net], destination_kind: "VAULT",
        fee: attemptStatus === "CONFIRMED" ? money(Math.floor(cents / 500)) : null, net: attemptStatus === "CONFIRMED" ? money(cents - Math.floor(cents / 500)) : null,
        fee_units: attemptStatus === "CONFIRMED" ? units(Math.floor(cents / 500)) : null, net_units: attemptStatus === "CONFIRMED" ? units(cents - Math.floor(cents / 500)) : null,
        expected_amount: money(cents), swept_amount: attemptStatus === "CONFIRMED" ? money(cents) : null, expected_units: units(cents), swept_units: attemptStatus === "CONFIRMED" ? units(cents) : null,
        tx_hash: hash, failure_reason: attemptStatus === "FAILED" ? "Sweep simulation reverted: relayer fee balance too low. A retry is scheduled." : null,
        created_at: iso(at), confirmed_at: attemptStatus === "CONFIRMED" ? iso(at + 45_000) : null,
        relayer_fee: attemptStatus === "CONFIRMED" ? { native_wei: feeUsdc ? null : String(between(80, 190) * 1_000_000_000_000), native_symbol: n.native.symbol, usdc: feeUsdc } : null,
        explorer_url: null,
      };
      sts.push(sttl);
      settlements.push(sttl);
      if (attemptStatus === "CONFIRMED") {
        transactions.push({
          id: id("tx"), kind: "SWEEP", network: s.net, tx_hash: hash, log_index: between(0, 4), payment_intent_id: pid, status: "FINAL", official_asset: true, token: n.usdc,
          from: deposit[s.net], to: vaultAddr[s.net], amount: money(cents), amount_units: units(cents), block_number: String(between(1_200_000, 1_900_000)), confirmations: n.confs,
          block_time: iso(at + 20_000), seen_at: iso(at + 20_000), explorer_url: null,
        });
        txs.push(transactions[transactions.length - 1]!);
      }
      return sttl;
    };
    /** detection → final → sweep → vault, pushing timeline facts. Returns the time vault funds are final. */
    const settleFlow = (cents: number, from: string, firstSeen: number, finalStatus: string, viaStatus: string | null) => {
      const t = incoming(cents, firstSeen, "FINAL");
      ev("transfer.detected", firstSeen, { from: payer, token: n.usdc, network: s.net, tx_hash: t.tx_hash, log_index: t.log_index, amount_units: units(cents) });
      change(from, "DETECTED", firstSeen);
      const fin = firstSeen + between(40, 150) * 1000;
      change("DETECTED", "CONFIRMING", firstSeen + 8000);
      ev("transfer.finalized", fin, { network: s.net, tx_hash: t.tx_hash, confirmations: n.confs });
      paidAt = fin;
      if (wallet) {
        timeline.splice(1, 0, { id: id("pev"), type: "wallet_payment.submitted", data: { network: s.net }, at: iso(firstSeen - 4000) }, { id: id("pev"), type: "wallet_payment.detected", data: { network: s.net, tx_hash: t.tx_hash }, at: iso(firstSeen) });
        change("CONFIRMING", finalStatus, fin);
        settledAt = fin;
        return fin;
      }
      const sw = sweep(cents, fin + 2000, "CONFIRMED");
      ev("settlement.queued", fin + 1000, { attempt: 1, network: s.net, expected_units: units(cents) });
      change("CONFIRMING", viaStatus ?? finalStatus, fin + 1000);
      ev("settlement.submitted", fin + 4000, { network: s.net, tx_hash: sw.tx_hash });
      ev("settlement.swept", fin + 25_000, { network: s.net, tx_hash: sw.tx_hash, amount_units: units(cents) });
      ev("settlement.finalized", fin + 48_000, { network: s.net, tx_hash: sw.tx_hash, confirmations: n.confs });
      if (viaStatus) change(viaStatus, finalStatus, fin + 48_000);
      settledAt = fin + 48_000;
      return fin + 48_000;
    };

    const seen = s.createdAt + between(40, 18 * 60) * 1000;
    const refundTo = payer;

    switch (status) {
      case "SETTLED": {
        const end = settleFlow(amountCents, "AWAITING_PAYMENT", seen, "SETTLED", "SETTLEMENT_PENDING");
        received = settled = amountCents;
        void end;
        break;
      }
      case "OVERPAID": {
        excess = pick([250, 500, 1000]);
        const sent = amountCents + excess;
        settleFlow(sent, "AWAITING_PAYMENT", seen, "OVERPAID", "SETTLEMENT_PENDING");
        received = settled = sent;
        break;
      }
      case "UNDERPAID": {
        const sent = Math.round((amountCents * between(70, 92)) / 100 / 5) * 5;
        const t = incoming(sent, seen, "FINAL");
        ev("transfer.detected", seen, { from: payer, token: n.usdc, network: s.net, tx_hash: t.tx_hash, log_index: t.log_index, amount_units: units(sent) });
        change("AWAITING_PAYMENT", "DETECTED", seen);
        change("DETECTED", "CONFIRMING", seen + 8000);
        ev("transfer.finalized", seen + 90_000, { network: s.net, tx_hash: t.tx_hash, confirmations: n.confs });
        change("CONFIRMING", "UNDERPAID", expires);
        const sw = sweep(sent, expires + 2000, "CONFIRMED");
        ev("settlement.queued", expires + 1000, { attempt: 1, network: s.net, expected_units: units(sent) });
        ev("settlement.submitted", expires + 4000, { network: s.net, tx_hash: sw.tx_hash });
        ev("settlement.finalized", expires + 48_000, { network: s.net, tx_hash: sw.tx_hash, confirmations: n.confs });
        received = settled = sent;
        break;
      }
      case "EXPIRED":
        change("AWAITING_PAYMENT", "EXPIRED", expires);
        break;
      case "LATE_PAYMENT": {
        change("AWAITING_PAYMENT", "EXPIRED", expires);
        const late = expires + between(8, 55) * MIN;
        settleFlow(amountCents, "EXPIRED", late, "LATE_PAYMENT", null);
        received = settled = amountCents;
        break;
      }
      case "REFUND_REQUESTED":
      case "PARTIALLY_REFUNDED":
      case "REFUNDED": {
        const end = settleFlow(amountCents, "AWAITING_PAYMENT", seen, "SETTLED", "SETTLEMENT_PENDING");
        received = settled = amountCents;
        const rid = id("rfd");
        const refundCents = status === "PARTIALLY_REFUNDED" ? Math.round(amountCents * 0.3 / 5) * 5 : amountCents;
        const reqAt = end + between(1, 5) * DAY;
        const rf: Json = { id: rid, payment_intent_id: pid, status: status === "REFUND_REQUESTED" ? "REQUESTED" : "COMPLETED", recipient: refundTo, amount: money(refundCents), amount_units: units(refundCents), reason: "Customer returned the order", explorer_url: null, created_at: iso(reqAt) };
        ev("refund.requested", reqAt, { refund_id: rid, amount_units: units(refundCents) });
        if (status === "REFUND_REQUESTED") {
          change("SETTLED", "REFUND_REQUESTED", reqAt);
        } else {
          const rhash = txHash();
          ev("refund.completed", reqAt + 3 * HOUR, { refund_id: rid, tx_hash: rhash });
          change("SETTLED", status, reqAt + 3 * HOUR);
          refunded = refundCents;
          rf.tx_hash = rhash;
          transactions.push({
            id: id("tx"), kind: "REFUND", network: s.net, tx_hash: rhash, log_index: 0, payment_intent_id: pid, status: "FINAL", official_asset: true, token: n.usdc,
            from: vaultAddr[s.net], to: refundTo, amount: money(refundCents), amount_units: units(refundCents), block_number: String(between(1_200_000, 1_900_000)), confirmations: n.confs,
            block_time: iso(reqAt + 3 * HOUR), seen_at: iso(reqAt + 3 * HOUR), explorer_url: null,
          });
          txs.push(transactions[transactions.length - 1]!);
        }
        refunds.push(rf);
        refundRequests.push(rf);
        break;
      }
      case "SETTLEMENT_PENDING": {
        const t = incoming(amountCents, seen, "FINAL");
        ev("transfer.detected", seen, { from: payer, token: n.usdc, network: s.net, tx_hash: t.tx_hash, log_index: t.log_index, amount_units: units(amountCents) });
        change("AWAITING_PAYMENT", "DETECTED", seen);
        change("DETECTED", "CONFIRMING", seen + 8000);
        ev("transfer.finalized", seen + 60_000, { network: s.net, tx_hash: t.tx_hash, confirmations: n.confs });
        const sw = sweep(amountCents, seen + 62_000, "SUBMITTED");
        ev("settlement.queued", seen + 61_000, { attempt: 1, network: s.net, expected_units: units(amountCents) });
        ev("settlement.submitted", seen + 64_000, { network: s.net, tx_hash: sw.tx_hash });
        change("CONFIRMING", "SETTLEMENT_PENDING", seen + 61_000);
        received = amountCents;
        break;
      }
      case "CONFIRMING": {
        const t = incoming(amountCents, seen, "CONFIRMING");
        ev("transfer.detected", seen, { from: payer, token: n.usdc, network: s.net, tx_hash: t.tx_hash, log_index: t.log_index, amount_units: units(amountCents) });
        change("AWAITING_PAYMENT", "DETECTED", seen);
        change("DETECTED", "CONFIRMING", seen + 8000);
        pending = amountCents;
        break;
      }
      case "DETECTED": {
        const t = incoming(amountCents, seen, "DETECTED");
        ev("transfer.detected", seen, { from: payer, token: n.usdc, network: s.net, tx_hash: t.tx_hash, log_index: t.log_index, amount_units: units(amountCents) });
        change("AWAITING_PAYMENT", "DETECTED", seen);
        pending = amountCents;
        break;
      }
      case "AWAITING_PAYMENT":
        break;
      case "SETTLEMENT_FAILED": {
        const t = incoming(amountCents, seen, "FINAL");
        ev("transfer.detected", seen, { from: payer, token: n.usdc, network: s.net, tx_hash: t.tx_hash, log_index: t.log_index, amount_units: units(amountCents) });
        change("AWAITING_PAYMENT", "DETECTED", seen);
        change("DETECTED", "CONFIRMING", seen + 8000);
        ev("transfer.finalized", seen + 70_000, { network: s.net, tx_hash: t.tx_hash, confirmations: n.confs });
        sweep(amountCents, seen + 72_000, "FAILED");
        ev("settlement.queued", seen + 71_000, { attempt: 1, network: s.net, expected_units: units(amountCents) });
        change("CONFIRMING", "SETTLEMENT_FAILED", seen + 80_000);
        received = amountCents;
        break;
      }
      case "INVALID_ASSET": {
        const t = incoming(amountCents, seen, "FINAL", false);
        ev("transfer.invalid_asset", seen, { from: payer, token: t.token, network: s.net, tx_hash: t.tx_hash });
        change("AWAITING_PAYMENT", "INVALID_ASSET", seen);
        break;
      }
    }

    const ref = `NW-${10400 + idx}`;
    const overpaid = excess > 0;
    const p: Json = {
      id: pid, object: "payment_intent", livemode: false, kind, status,
      amount: money(amountCents), amount_units: units(amountCents),
      amount_received: money(received), amount_received_units: units(received),
      amount_pending: money(pending), amount_pending_units: units(pending),
      amount_settled: money(settled), amount_settled_units: units(settled),
      fee_amount: money(Math.floor(settled / 500)), fee_amount_units: units(Math.floor(settled / 500)),
      net_amount: money(settled - Math.floor(settled / 500)), net_amount_units: units(settled - Math.floor(settled / 500)),
      amount_refunded: money(refunded), excess_amount: overpaid ? money(excess) : "0.00", currency: "USDC",
      order_reference: kind === "PAYMENT_LINK" ? `LINK-${10400 + idx}` : ref,
      description: kind === "INVOICE" ? `Invoice for ${cust![0]}` : s.desc, customer_email: cust ? cust[1] : null, metadata: {},
      checkout_methods: ["WALLET", "ADDRESS"], checkout_url: `/demo/payments/${pid}`, success_url: null,
      expires_at: iso(expires), created_at: iso(s.createdAt), paid_at: paidAt ? iso(paidAt) : null, settled_at: settledAt ? iso(settledAt) : null,
      networks: netIds.map((x) => ({
        network: x, chain_id: NETS[x].chain_id, name: NETS[x].name, environment: "mainnet", usdc_address: NETS[x].usdc, deposit_address: deposit[x], deposit_address_explorer_url: null,
        explorer_url: null, native_currency: NETS[x].native, public_rpc_urls: [], finality_confirmations: NETS[x].finality.confirmations, wallet_checkout_supported: true,
      })),
      // detail-only
      timeline: timeline.sort((a, b) => a.at.localeCompare(b.at)),
      transactions: txs, settlements: sts, attempts: [], refunds,
      invoice_addresses: [s.net, ...netIds.filter((x) => x !== s.net)].map((x) => ({ network: x, address: deposit[x], vault: vaultAddr[x], destination: vaultAddr[x], destination_kind: "VAULT", fee_bps: 20, deployed: x === s.net && !wallet && sts.length > 0, deploy_tx_hash: null, factory: addr(), contract_version: 1 })),
      _net: s.net, _wallet: wallet,
    };
    payments.push(p);
  });

  payments.sort((a, b) => b.created_at.localeCompare(a.created_at));
  transactions.sort((a, b) => b.seen_at.localeCompare(a.seen_at));
  settlements.sort((a, b) => b.created_at.localeCompare(a.created_at));
  refundRequests.sort((a, b) => b.created_at.localeCompare(a.created_at));
  // One rejected request on an otherwise healthy payment, so the status filter has variety.
  const healthy = payments.find((p) => p.status === "SETTLED");
  if (healthy) refundRequests.push({ id: id("rfd"), payment_intent_id: healthy.id, status: "REJECTED", recipient: addr(), amount: "5.00", amount_units: units(500), reason: "Duplicate request", explorer_url: null, created_at: healthy.created_at });

  // ── vaults and networks (balances derive from the payments above)
  const balance = (net: NetId) => payments.filter((p) => p._net === net).reduce((a, p) => a + Number(p.amount_settled_units) - Number(p.amount_refunded) * 1_000_000, 0);
  const vaults: Record<string, Json> = {};
  const networks = netIds.map((x) => {
    const n = NETS[x];
    const vault = {
      id: id("vlt"), network: x, status: "ACTIVE", owner_address: ownerAddr, vault_address: vaultAddr[x], vault_explorer_url: null, config_delay_seconds: 86400, created_tx_hash: txHash(),
    };
    vaults[x] = {
      ...vault,
      onchain: {
        owner: ownerAddr, pending_owner: "0x0000000000000000000000000000000000000000",
        mode: x === "arc-testnet" ? "BALANCE_IN_VAULT" : "INSTANT_FORWARD", destination: x === "arc-testnet" ? "0x0000000000000000000000000000000000000000" : payoutAddr,
        threshold_units: "0", interval_seconds: "0", balance_units: String(x === "arc-testnet" ? Math.max(0, Math.round(balance(x))) : 0), can_forward: x !== "arc-testnet", gateway_has_admin_role: false,
      },
    };
    return {
      id: x, chain_id: n.chain_id, name: n.name, environment: "mainnet", operational: true, not_operational_reasons: [], explorer_url: null, public_rpc_urls: [],
      chain_native: n.native, native_currency: n.native.symbol, gas_model: n.gas_model, usdc: { address: n.usdc, decimals: 6 }, payment_methods: { address: true, wallet: true },
      authorization: { receive_with_authorization: true, transfer_with_authorization: true, verified_at: "2026-10-01" }, finality: n.finality,
      circle: { cctpDomain: n.cctp, gatewayNanopayments: null, gasStation: null },
      contracts: { vault_factory: addr(), invoice_factory: addr(), invoice_implementation: addr(), payment_router: addr(), version: 2 }, relayer_address: relayer, vault,
      fee: { bps: 20, percent: "0.2%", max_bps: 100, treasury: addr() },
    };
  });

  // Base forwards instantly: nothing stays in the vault.
  // ── payment links
  const links = [
    ["Ethiopia Guji, 1 kg", "34.00", "guji-1kg", true], ["Espresso blend, 5 kg", "118.00", "espresso-5kg", true],
    ["Gift box, medium", "48.00", "gift-box-m", true], ["Brew class, 2 seats", "90.00", "brew-class", false],
  ].map(([name, amount, slug, active]) => ({ id: id("plink"), name, amount, url: `https://${new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://plinth.zerolayer.online").host}/l/${slug}`, networks: ["Arc", "Base"], active, created_at: iso(anchor - between(5, 28) * DAY) }));

  // ── invoices (the invoice-kind payments, newest first)
  const invoices = payments.filter((p) => p.kind === "INVOICE").slice(0, 8).map((p, i, all) => ({
    id: id("inv"), number: `NW-INV-${String(all.length - i + 40).padStart(4, "0")}`, customer_name: p.description.replace("Invoice for ", ""), status: p.status, payment_id: p.id,
    checkout_url: p.checkout_url, due_at: iso(Date.parse(p.created_at) + 14 * DAY), total: p.amount, created_at: p.created_at,
  }));

  // ── developer surfaces
  const apiKeys = [
    { id: id("key"), name: "Checkout backend", environment: "test", prefix: `sk_test_d3d0${hex(4)}`, last_used_at: iso(anchor - 12 * MIN), revoked_at: null, created_at: iso(anchor - 27 * DAY) },
    { id: id("key"), name: "Staging", environment: "test", prefix: `sk_test_d3d0${hex(4)}`, last_used_at: iso(anchor - 6 * DAY), revoked_at: null, created_at: iso(anchor - 19 * DAY) },
    { id: id("key"), name: "Old POS integration", environment: "test", prefix: `sk_test_d3d0${hex(4)}`, last_used_at: iso(anchor - 21 * DAY), revoked_at: iso(anchor - 20 * DAY), created_at: iso(anchor - 29 * DAY) },
  ];
  const epProd = id("whe");
  const epStage = id("whe");
  const webhookEndpoints = [
    { id: epProd, url: "https://orders.northwind.example/hooks/plinth", description: null, events: ["*"], status: "ACTIVE", livemode: false, consecutive_failures: 0, created_at: iso(anchor - 27 * DAY) },
    { id: epStage, url: "https://staging.northwind.example/hooks/plinth", description: null, events: ["payment.completed", "payment.expired", "settlement.failed"], status: "ACTIVE", livemode: false, consecutive_failures: 4, created_at: iso(anchor - 18 * DAY) },
  ];

  const deliveries: Json[] = [];
  const attempts: Record<string, Json[]> = {};
  const addDelivery = (endpoint: Json, type: string, at: number, outcome: "ok" | "retried" | "retrying" | "abandoned") => {
    const did = id("dlv");
    const n = outcome === "ok" ? 1 : outcome === "retried" ? 2 : outcome === "retrying" ? 3 : 6;
    const list: Json[] = [];
    for (let a = 1; a <= n; a++) {
      const failed = outcome !== "ok" && (outcome === "retrying" || outcome === "abandoned" || a < n);
      const at2 = at + 2000 + (a - 1) * (a * 40_000);
      list.push({
        attempt: a, status_code: failed ? (a % 3 === 0 ? null : 503) : 200,
        error: failed ? (a % 3 === 0 ? "connect ETIMEDOUT after 10000 ms" : "HTTP 503 Service Unavailable") : null,
        duration_ms: failed && a % 3 === 0 ? 10_000 : between(28, 190), response_snippet: failed ? (a % 3 === 0 ? null : '{"error":"upstream unavailable"}') : '{"received":true}', at: iso(at2),
      });
    }
    const last = list[list.length - 1]!;
    attempts[did] = list;
    deliveries.push({
      id: did, status: outcome === "ok" || outcome === "retried" ? "SUCCEEDED" : outcome === "retrying" ? "RETRYING" : "ABANDONED", attempts: n, lastStatusCode: last.status_code, lastError: last.error,
      lastAttemptAt: last.at, nextAttemptAt: outcome === "retrying" ? iso(anchor + 20 * MIN) : null, createdAt: iso(at), eventId: id("evt"), eventType: type,
      endpointId: endpoint.id, endpointUrl: endpoint.url,
    });
  };
  const eventFor = (p: Json): string[] => {
    switch (p.status) {
      case "SETTLED": return p._wallet ? ["payment.completed"] : ["payment.completed", "settlement.completed"];
      case "OVERPAID": return ["payment.overpaid", "settlement.completed"];
      case "UNDERPAID": return ["payment.underpaid"];
      case "EXPIRED": return ["payment.expired"];
      case "LATE_PAYMENT": return ["payment.late"];
      case "INVALID_ASSET": return ["payment.invalid_asset"];
      case "SETTLEMENT_FAILED": return ["payment.confirmed", "settlement.failed"];
      case "CONFIRMING": case "DETECTED": return ["payment.detected"];
      case "SETTLEMENT_PENDING": return ["payment.confirmed", "settlement.submitted"];
      case "REFUND_REQUESTED": return ["payment.completed", "refund.requested"];
      case "PARTIALLY_REFUNDED": case "REFUNDED": return ["payment.completed", "refund.requested", "refund.completed"];
      default: return [];
    }
  };
  payments.forEach((p, i) => {
    const base = p.settled_at ? Date.parse(p.settled_at) : p.paid_at ? Date.parse(p.paid_at) : p.status === "EXPIRED" ? Date.parse(p.expires_at) : Date.parse(p.created_at) + 5 * MIN;
    eventFor(p).forEach((type, k) => {
      const at = base + k * 1500;
      addDelivery(webhookEndpoints[0]!, type, at, i % 11 === 4 ? "retried" : "ok");
      if (webhookEndpoints[1]!.events.includes(type)) {
        const fresh = anchor - at < 2 * DAY;
        addDelivery(webhookEndpoints[1]!, type, at, fresh ? "retrying" : i % 3 === 0 ? "abandoned" : "ok");
      }
    });
  });
  deliveries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ── team, policy, audit
  const team = [
    { id: id("usr"), email: DEMO_USER_EMAIL, role: "OWNER", last_login_at: iso(anchor - 25 * MIN), created_at: iso(anchor - 30 * DAY) },
    { id: id("usr"), email: "ines@northwind.example", role: "ADMIN", last_login_at: iso(anchor - 2 * DAY), created_at: iso(anchor - 26 * DAY) },
    { id: id("usr"), email: "dev@northwind.example", role: "DEVELOPER", last_login_at: iso(anchor - 5 * HOUR), created_at: iso(anchor - 24 * DAY) },
    { id: id("usr"), email: "books@northwind.example", role: "VIEWER", last_login_at: null, created_at: iso(anchor - 9 * DAY) },
  ];
  const accounting = { underpayment_tolerance_bps: 0, overpayment_policy: "ACCEPT", default_expiry_seconds: 1200 };
  const policy = { accounting, vaults: netIds.map((x) => vaults[x]) };

  const actor = (type: string, i: number) => ({ actor_type: type, actor_id: type === "USER" ? team[i % team.length]!.id : type === "API_KEY" ? apiKeys[0]!.id : null });
  const auditRows: [string, string, number, string | null, string | null][] = [
    ["user.login", "USER", 25 * MIN, null, null], ["payment_link.created", "USER", 2 * DAY, "payment_link", links[1]!.id], ["user.login", "USER", 2 * DAY + HOUR, null, null],
    ["refund.requested", "USER", 3 * DAY, "payment_intent", payments.find((p) => p.status === "REFUND_REQUESTED")?.id ?? null], ["api_key.used", "API_KEY", 5 * DAY, "api_key", apiKeys[0]!.id],
    ["webhook_endpoint.created", "USER", 18 * DAY, "webhook_endpoint", epStage], ["api_key.created", "USER", 19 * DAY, "api_key", apiKeys[1]!.id],
    ["team.member_added", "USER", 24 * DAY, "user", team[2]!.id], ["settings.updated", "USER", 25 * DAY, null, null], ["api_key.revoked", "USER", 20 * DAY, "api_key", apiKeys[2]!.id],
    ["team.member_added", "USER", 9 * DAY, "user", team[3]!.id], ["webhook_endpoint.created", "USER", 27 * DAY, "webhook_endpoint", epProd], ["api_key.created", "USER", 27 * DAY, "api_key", apiKeys[0]!.id],
    ["vault.created", "USER", 28 * DAY, "vault", vaults["base-sepolia"]!.id], ["vault.created", "USER", 29 * DAY, "vault", vaults["arc-testnet"]!.id], ["merchant.created", "USER", 30 * DAY, "merchant", null],
  ];
  const ips = ["203.0.113.24", "198.51.100.7", "203.0.113.88"];
  const audit = auditRows.map(([action, type, ago, tt, tid], i) => ({
    id: id("aud"), ...actor(type, i), action, target_type: tt, target_id: tid, data: {}, ip: type === "API_KEY" ? ips[1] : ips[i % ips.length], created_at: iso(anchor - ago),
  })).sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Vault creation shows up as on-chain activity too.
  netIds.forEach((x, i) => {
    transactions.push({
      id: id("tx"), kind: "VAULT_CREATE", network: x, tx_hash: vaults[x]!.created_tx_hash, log_index: 0, payment_intent_id: null, status: "FINAL", official_asset: true, token: NETS[x].usdc,
      from: relayer, to: vaultAddr[x], amount: "0.00", amount_units: "0", block_number: String(1_100_000 + i), confirmations: NETS[x].confs, block_time: iso(anchor - (29 - i) * DAY), seen_at: iso(anchor - (29 - i) * DAY), explorer_url: null,
    });
  });
  transactions.sort((a, b) => b.seen_at.localeCompare(a.seen_at));

  return {
    anchor,
    me: {
      merchant: { id: id("mer"), name: DEMO_MERCHANT_NAME, ...accounting },
      user: { id: team[0]!.id, email: DEMO_USER_EMAIL, role: "OWNER" }, role: "OWNER", environment: "test", via: "session",
    },
    networks, vaults, payments, transactions, settlements, refundRequests, paymentLinks: links, invoices, apiKeys, webhookEndpoints, webhookDeliveries: deliveries, deliveryAttempts: attempts,
    team, policy, audit,
  };
}

// ───────────────────────────────────────────────────────────── derived views

const SUCCESS = new Set(["SETTLED", "OVERPAID", "PAID", "SETTLEMENT_PENDING", "SETTLEMENT_FAILED", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED"]);
const OPENS = new Set(["AWAITING_PAYMENT", "DETECTED", "CONFIRMING", "CREATED"]);
const FAILED = new Set(["EXPIRED", "UNDERPAID", "LATE_PAYMENT", "INVALID_ASSET"]);

/** `/v1/overview`, derived from the payments list so every figure and chart matches the tables. */
export function demoOverview(ds: DemoDataset, days: number): Json {
  const since = ds.anchor - days * DAY;
  const inWindow = ds.payments.filter((p) => Date.parse(p.created_at) >= since);
  const sum = (f: (p: Json) => number) => inWindow.reduce((a, p) => a + f(p), 0);
  const fmt = (u: number) => ({ amount: money(Math.round(u / 10_000)), units: String(u) });
  const refunded = sum((p) => Number(p.amount_refunded) * 1_000_000);
  const byStatus: Record<string, number> = {};
  for (const p of inWindow) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  const successful = inWindow.filter((p) => SUCCESS.has(p.status)).length;
  const pending = inWindow.filter((p) => OPENS.has(p.status)).length;
  const failed = inWindow.filter((p) => FAILED.has(p.status)).length;
  const dist = new Map<string, { units: number; payments: number }>();
  const daily = new Map<string, { units: number; payments: number }>();
  for (const p of inWindow) {
    const u = Number(p.amount_received_units);
    const day = p.created_at.slice(0, 10);
    const d = daily.get(day) ?? { units: 0, payments: 0 };
    d.units += u; d.payments += 1; daily.set(day, d);
    if (u > 0) { const x = dist.get(p._net) ?? { units: 0, payments: 0 }; x.units += u; x.payments += 1; dist.set(p._net, x); }
  }
  return {
    window_days: days, livemode: false,
    received_final: fmt(sum((p) => Number(p.amount_received_units))), settled_to_vault: fmt(sum((p) => Number(p.amount_settled_units))),
    settled: fmt(sum((p) => Number(p.amount_settled_units))), platform_fees: fmt(sum((p) => Number(p.fee_amount_units))), net_settled: fmt(sum((p) => Number(p.net_amount_units))),
    pending: fmt(sum((p) => Number(p.amount_pending_units))), refunded: fmt(refunded),
    counts: { total: inWindow.length, successful, pending, failed, settlement_failed: byStatus["SETTLEMENT_FAILED"] ?? 0 },
    success_rate: successful + failed === 0 ? null : Math.round((successful / (successful + failed)) * 100),
    by_status: byStatus,
    network_distribution: [...dist].map(([network, v]) => ({ network, name: NETS[network as NetId].name, ...fmt(v.units), payments: v.payments })).sort((a, b) => Number(b.units) - Number(a.units)),
    daily: [...daily].map(([day, v]) => ({ day, received_final_units: String(v.units), payments: v.payments })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}
