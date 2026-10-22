import type { NetworkConfig } from "@plinth/shared";
import type { RelayerPolicy } from "./context";

const E18 = 10n ** 18n;

type Tier = "testnet" | "l2" | "ethereum" | "polygon" | "arc" | "explicit";

/** Which spending tier a network belongs to. The numbers differ because the native token and fee level differ. */
function tierOf(net: NetworkConfig): Tier {
  if (net.environment === "testnet") return "testnet";
  if (net.gas.model === "usdc-native") return "arc";
  if (net.id === "ethereum-mainnet") return "ethereum";
  if (net.id === "polygon-mainnet") return "polygon";
  // Limits are in the native token. Where it is not ETH-priced (AVAX, CELO, SEI, ...), no default is safe: the operator must set them.
  if (net.nativeCurrency.symbol !== "ETH") return "explicit";
  return "l2";
}

/**
 * Safety limits for what the relayer may spend, per tier. They are limits, not prices: the actual fee of
 * every transaction is quoted from the live network at send time (see quoteFees) and the transaction is
 * deferred, with an alert, whenever that live fee would exceed `maxFeePerTxWei`.
 *
 * Units are the chain's native token in wei (18 decimals everywhere we support; native USDC on Arc).
 * Defaults are deliberately low on L2s and higher on Ethereum mainnet, where a deployment-plus-sweep costs
 * far more. Override any field per network with RELAYER_POLICY_<NETWORK> (JSON, wei as decimal strings).
 */
const DEFAULTS: Record<Tier, RelayerPolicy> = {
  // Placeholder values for a native token we cannot price: tiny, so nothing is spent until RELAYER_POLICY_<NETWORK> is set (see policyNeedsOperator).
  explicit: {
    maxDailyGasWei: 0n, maxFeePerTxWei: 0n, maxOpsPerDay: 0, minBalanceWei: E18, lowBalanceAlertWei: E18,
    replaceAfterSeconds: 60, maxReplacements: 4, minSweepUnits: 1_000_000n, maxSettlementAttempts: 5,
  },
  // Generous: test tokens are free.
  testnet: {
    maxDailyGasWei: E18 / 2n, maxFeePerTxWei: E18 / 100n, maxOpsPerDay: 5000, minBalanceWei: E18 / 1000n, lowBalanceAlertWei: E18 / 50n,
    replaceAfterSeconds: 60, maxReplacements: 4, minSweepUnits: 10_000n, maxSettlementAttempts: 5,
  },
  // Cheap networks (Base, Optimism, Arbitrum): keep every limit small; a sweep costs a fraction of a cent to a few cents.
  l2: {
    maxDailyGasWei: E18 / 20n, maxFeePerTxWei: E18 / 2000n, maxOpsPerDay: 2000, minBalanceWei: E18 / 500n, lowBalanceAlertWei: E18 / 100n,
    replaceAfterSeconds: 60, maxReplacements: 4, minSweepUnits: 1_000_000n, maxSettlementAttempts: 5,
  },
  // Ethereum mainnet: higher caps and a higher dust floor, because every operation is expensive.
  ethereum: {
    maxDailyGasWei: E18 / 2n, maxFeePerTxWei: E18 / 100n, maxOpsPerDay: 500, minBalanceWei: E18 / 50n, lowBalanceAlertWei: E18 / 5n,
    replaceAfterSeconds: 180, maxReplacements: 4, minSweepUnits: 25_000_000n, maxSettlementAttempts: 5,
  },
  // Polygon PoS: the native token is POL, so the wei figures are POL.
  polygon: {
    maxDailyGasWei: 200n * E18, maxFeePerTxWei: 5n * E18, maxOpsPerDay: 2000, minBalanceWei: 10n * E18, lowBalanceAlertWei: 50n * E18,
    replaceAfterSeconds: 90, maxReplacements: 4, minSweepUnits: 1_000_000n, maxSettlementAttempts: 5,
  },
  // Arc: gas is paid in USDC (shown here in 18-decimal native units).
  arc: {
    maxDailyGasWei: 20n * E18, maxFeePerTxWei: E18 / 10n, maxOpsPerDay: 5000, minBalanceWei: E18, lowBalanceAlertWei: 5n * E18,
    replaceAfterSeconds: 60, maxReplacements: 4, minSweepUnits: 10_000n, maxSettlementAttempts: 5,
  },
};

export interface ResolvedPolicy {
  policy: RelayerPolicy;
  /** "env": taken (at least partly) from RELAYER_POLICY_<NETWORK>. "default": the tier default above. */
  source: "env" | "default";
  tier: Tier;
}

/** The policy for a network: its tier default, overridden field by field by RELAYER_POLICY_<NETWORK>. */
export function resolvePolicyDetails(net: NetworkConfig, env: Record<string, string | undefined> = process.env): ResolvedPolicy {
  const tier = tierOf(net);
  // Arc Testnet pays gas in USDC at the same fee level as Arc: creating a vault costs about 0.03 USDC, above the generic testnet cap.
  const base = tier === "testnet" && net.gas.model === "usdc-native" ? { ...DEFAULTS.testnet, maxFeePerTxWei: E18 / 10n, maxDailyGasWei: 5n * E18 } : DEFAULTS[tier];
  const key = `RELAYER_POLICY_${net.id.toUpperCase().replace(/-/g, "_")}`;
  const raw = env[key];
  if (!raw) return { policy: { ...base }, source: "default", tier };
  const j = JSON.parse(raw) as Record<string, string | number>;
  const big = (k: string, fallback: bigint) => (j[k] === undefined ? fallback : BigInt(String(j[k])));
  const num = (k: string, fallback: number) => (j[k] === undefined ? fallback : Number(j[k]));
  return {
    tier,
    source: "env",
    policy: {
      maxDailyGasWei: big("maxDailyGasWei", base.maxDailyGasWei),
      maxFeePerTxWei: big("maxFeePerTxWei", base.maxFeePerTxWei),
      maxOpsPerDay: num("maxOpsPerDay", base.maxOpsPerDay),
      minBalanceWei: big("minBalanceWei", base.minBalanceWei),
      lowBalanceAlertWei: big("lowBalanceAlertWei", base.lowBalanceAlertWei),
      replaceAfterSeconds: num("replaceAfterSeconds", base.replaceAfterSeconds),
      maxReplacements: num("maxReplacements", base.maxReplacements),
      minSweepUnits: big("minSweepUnits", base.minSweepUnits),
      maxSettlementAttempts: num("maxSettlementAttempts", base.maxSettlementAttempts),
    },
  };
}

export function resolveRelayerPolicy(net: NetworkConfig, env: Record<string, string | undefined> = process.env): RelayerPolicy {
  return resolvePolicyDetails(net, env).policy;
}

/** A mainnet whose native token is not ETH-priced has no safe default: it stays closed until the operator sets RELAYER_POLICY_<NETWORK>. */
export function policyNeedsOperator(net: NetworkConfig, resolved: ResolvedPolicy): boolean {
  return net.environment === "mainnet" && resolved.tier === "explicit" && resolved.source === "default";
}
