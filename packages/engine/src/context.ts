import type { LocalAccount, PublicClient, WalletClient } from "viem";
import type { EvmAdapter } from "@plinth/blockchain";
import type { Database } from "@plinth/db";
import type { Deployment, NetworkConfig, TokenConfig, TokenContracts, TokenSymbol } from "@plinth/shared";
import type { EmailSender } from "./email";

/** Per-network guardrails on what the relayer may spend and do. Fail-closed on mainnet. */
export interface RelayerPolicy {
  /** Maximum total fee spend per rolling 24h, in the chain's native wei. */
  maxDailyGasWei: bigint;
  /** Hard cap on gasLimit * maxFeePerGas for any single transaction. */
  maxFeePerTxWei: bigint;
  /** Maximum relayer transactions per rolling 24h. */
  maxOpsPerDay: number;
  /** Do not send if the signer balance would drop below this. */
  minBalanceWei: bigint;
  /** Alert when the signer balance is below this. */
  lowBalanceAlertWei: bigint;
  /** Replace a pending transaction with higher fees after this long. */
  replaceAfterSeconds: number;
  maxReplacements: number;
  /** Do not spend gas sweeping less than this (dust-griefing protection). */
  minSweepUnits: bigint;
  /** Automatic settlement attempts before a human must retry. */
  maxSettlementAttempts: number;
}

/** One payment token on one chain: its registry entry, its own contract set and an adapter bound to them. */
export interface TokenRuntime {
  symbol: TokenSymbol;
  config: TokenConfig;
  contracts: TokenContracts;
  adapter: EvmAdapter;
  /** Open for NEW payments: the network is operational, this token's contracts are verified and its on-chain check passed. */
  operational: boolean;
  /** The static part of `operational` (contracts recorded and verified), before the live deployment check. */
  baseOperational: boolean;
  reasons: string[];
}

export interface ChainRuntime {
  network: NetworkConfig;
  deployment: Deployment;
  /** The USDC adapter: the network's primary token. Other tokens are in `tokens`. */
  adapter: EvmAdapter;
  tokens: Map<TokenSymbol, TokenRuntime>;
  client: PublicClient;
  /** Absent when no relayer key is configured: the chain is then observe-only. */
  signer?: LocalAccount;
  /**
   * The custody wallet: a key SEPARATE from the relayer's, holding merchants' balances for the custodial payout mode.
   * Present only when custody is switched on for this network; `custodyReasons` says why it is not otherwise.
   */
  custody?: LocalAccount;
  custodyReasons: string[];
  /** Tokens whose withdrawals are paused because the custody wallet holds less than merchants are owed. Maintained by custodyTick. */
  custodyHalted?: Record<string, string>;
  wallet?: WalletClient;
  policy: RelayerPolicy;
  /** Effective state: the static gate AND the latest on-chain deployment check. Non-operational chains accept no new invoices. */
  operational: boolean;
  gateReasons: string[];
  /** Result of operationalGate() alone (registry, env and deployment record). */
  baseOperational: boolean;
  baseReasons: string[];
  /** Latest comparison of the deployed contracts with the deployment record and configuration. */
  deploymentCheck?: { ok: boolean; reasons: string[]; at: number; registry: boolean; tokenReasons?: Partial<Record<TokenSymbol, string[]>> };
}

export interface EngineConfig {
  publicWebUrl: string;
  /** 32-byte key encrypting webhook signing secrets at rest. */
  secretKey: Buffer;
  /** Keep watching invoice addresses this long after creation (late deposits). */
  lateWindowDays: number;
  /** Allow webhooks to http://localhost style targets (development only). */
  allowPrivateWebhookTargets: boolean;
  alertWebhookUrl?: string;
  sessionTtlSeconds: number;
  /** Default platform fee in basis points for merchants without their own override. */
  platformFeeBps: number;
  /** How long an emailed one-time link stays valid. */
  emailLinkTtlSeconds: number;
  /** How recently a user must have signed in again to change sensitive settings. */
  reauthWindowSeconds: number;
  /** Require a signature from the vault owner wallet when a vault is created (default on in production). */
  requireVaultOwnerProof: boolean;
  /** Time a newly confirmed payout wallet waits before new invoices use it (0 in development). */
  payoutCooldownSeconds: number;
  /**
   * A new payout or withdrawal wallet must be confirmed by a link emailed to the account (default off for now). When off, a signed proof,
   * a fresh re-authentication and the cooldown are the protections; no email address is needed.
   */
  requireEmailConfirmation: boolean;
  /** The custodial payout mode exists at all (default off). */
  custodyEnabled: boolean;
  /** Custody may be used on a mainnet (default off; needs the owner's explicit approval). */
  allowCustodyMainnet: boolean;
  /** Web3Auth client id the identity tokens must be issued for. */
  web3authClientId?: string;
  /** Circle API key for sign-in with Circle User-Controlled Wallets (server only). */
  circleApiKey?: string;
  /** Replaces the Circle user-token check (tests only). */
  verifyCircleUserToken?: (userToken: string) => Promise<import("./web3auth").Web3AuthIdentity>;
  /** Replaces identity-token verification (tests only). */
  verifyIdentityToken?: (idToken: string) => Promise<import("./web3auth").Web3AuthIdentity>;
}

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

export type AlertSeverity = "info" | "warning" | "critical";
export interface Alert {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: Record<string, unknown>;
}
export interface AlertSink {
  raise(alert: Alert): Promise<void>;
}

export interface Engine {
  db: Database;
  cfg: EngineConfig;
  chains: Map<string, ChainRuntime>;
  log: Logger;
  alerts: AlertSink;
  email: EmailSender;
  now(): Date;
}

export function chainOf(e: Engine, networkId: string): ChainRuntime {
  const c = e.chains.get(networkId);
  if (!c) throw new EngineError("UNKNOWN_NETWORK", `Network ${networkId} is not configured`, 400);
  return c;
}

/** A token's runtime on a chain. `open` (default) requires it to accept NEW payments; observing existing funds does not. */
export function tokenRuntime(chain: ChainRuntime, symbol: string, opts: { open?: boolean } = {}): TokenRuntime {
  const t = chain.tokens.get(symbol as TokenSymbol);
  if (!t) throw new EngineError("TOKEN_UNAVAILABLE", `${symbol} is not supported on ${chain.network.name}`, 409);
  if ((opts.open ?? true) && !t.operational) throw new EngineError("TOKEN_UNAVAILABLE", `${symbol} is not available on ${chain.network.name} right now`, 409, { reasons: t.reasons });
  return t;
}

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const norm = (a: string) => a.toLowerCase();
