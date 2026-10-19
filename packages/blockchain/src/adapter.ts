import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { contractsFor, destinationKindFromIndex, destinationKindIndex, networkTokens, type Deployment, type DestinationKind, type NetworkConfig, type TokenConfig, type TokenContracts, type TokenSymbol } from "@plinth/shared";
import { InvoiceDepositAbi, InvoiceFactoryAbi, MerchantVaultAbi, PaymentRouterAbi, VaultFactoryAbi } from "./abi/generated";
import { computeInvoiceAddress, type InvoiceRoute } from "./invoice-address";
import type { RouterPayment } from "./eip3009";

const erc20Transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const invoicePaidEvent = parseAbiItem(
  "event InvoicePaid(bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed destination, uint8 kind, address payer, uint256 amount, uint256 fee, bytes32 nonce)",
);
const sweptEvent = parseAbiItem(
  "event Swept(bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed destination, uint8 kind, address token, uint256 amount, uint256 fee)",
);
const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/** Native USDC has 18 decimals, its ERC-20 view has 6: a native amount converts by dropping the last 12 digits. */
const NATIVE_TO_TOKEN = 10n ** 12n;

export interface ObservedTransfer {
  /** Token contract that emitted the Transfer (may NOT be the official USDC). */
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
}

export interface ObservedRouterPayment {
  invoiceId: Hex;
  merchantId: Hex;
  /** The vault or merchant wallet that received the net amount. */
  destination: Address;
  kind: DestinationKind;
  payer: Address;
  /** What the customer paid (before the fee). */
  amount: bigint;
  /** What the treasury actually received. 0 when the fee was zero or skipped. */
  fee: bigint;
  nonce: Hex;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
  emitter: Address;
}

export interface ObservedSweep {
  invoiceId: Hex;
  merchantId: Hex;
  /** The vault or merchant wallet that received the net amount. */
  destination: Address;
  kind: DestinationKind;
  token: Address;
  /** The whole swept balance (before the fee). */
  amount: bigint;
  /** What the treasury actually received. 0 when the fee was zero or skipped. */
  fee: bigint;
  /** The invoice clone that emitted the event. */
  emitter: Address;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
}

export type TransferVerification =
  | { ok: true; transfer: ObservedTransfer; blockTimestamp: number; official: boolean }
  | { ok: false; reason: string };

export interface HeadInfo {
  head: bigint;
  /** Chain's finalized block when the finality strategy uses it. */
  finalized: bigint | null;
}

export interface VaultState {
  address: Address;
  owner: Address;
  pendingOwner: Address;
  mode: "BALANCE_IN_VAULT" | "INSTANT_FORWARD" | "THRESHOLD_OR_PERIODIC";
  destination: Address;
  threshold: bigint;
  interval: bigint;
  configDelay: bigint;
  balance: bigint;
  canForward: boolean;
  /** Policy change waiting out its configuration delay (null if none). */
  pending: { effectiveAt: bigint; mode: VaultState["mode"]; destination: Address } | null;
}

const MODES = ["BALANCE_IN_VAULT", "INSTANT_FORWARD", "THRESHOLD_OR_PERIODIC"] as const;

/** Event args carry `kind` as a uint8; the rest of the code uses the string form. */
function normaliseKind<T extends object>(args: T): T & { kind: DestinationKind } {
  const kind = (args as { kind?: number | bigint }).kind;
  return { ...args, kind: destinationKindFromIndex(Number(kind)) };
}

/** What the deployed implementation, factory and router report about themselves. */
export interface DeploymentFacts {
  implementation: { token: Address; chainId: number; version: number; treasury: Address; maxFeeBps: number };
  factory: { implementation: Address; token: Address; vaults: Address; chainId: number; version: number; treasury: Address; maxFeeBps: number };
  router: { token: Address; vaults: Address; treasury: Address; maxFeeBps: number };
  treasuryHasCode: boolean;
}

/**
 * Network-agnostic surface the payment engine depends on. A Solana adapter would implement the same
 * observation/verification methods with its own address derivation; it must NOT reuse CREATE2/EIP-3009.
 */
export interface ChainAdapter {
  readonly network: NetworkConfig;
  getHeadInfo(): Promise<HeadInfo>;
  blockMeta(blockNumber: bigint): Promise<{ hash: Hex; timestamp: number } | null>;
  scanTransfers(from: bigint, to: bigint, addresses: Address[]): Promise<ObservedTransfer[]>;
  verifyTransfer(txHash: Hex, logIndex: number, expectedTo: Address): Promise<TransferVerification>;
  isFinal(blockNumber: bigint, info: HeadInfo): boolean;
  confirmations(blockNumber: bigint, info: HeadInfo): number;
}

/**
 * Everything the gateway does on one chain for ONE payment token: the token's own factory, implementation,
 * router and vault registry. A chain with two tokens has two adapters; the shared parts (treasury, fee cap,
 * vault delay) come from the deployment record.
 */
export class EvmAdapter implements ChainAdapter {
  readonly symbol: TokenSymbol;
  readonly token: TokenConfig;
  readonly contracts: TokenContracts;

  constructor(
    readonly network: NetworkConfig,
    readonly deployment: Deployment,
    readonly client: PublicClient,
    symbol: TokenSymbol = "USDC",
  ) {
    const token = networkTokens(network)[symbol];
    const contracts = contractsFor(deployment, symbol);
    if (!token) throw new Error(`${network.id} has no ${symbol} in the registry`);
    if (!contracts) throw new Error(`${network.id} has no ${symbol} contracts in its deployment record`);
    this.symbol = symbol;
    this.token = token;
    this.contracts = contracts;
  }

  /** The payment token's contract address (kept under its old name for existing callers). */
  get usdc(): Address {
    return this.token.address;
  }

  // ------------------------------------------------------------------ observation

  async getHeadInfo(): Promise<HeadInfo> {
    const head = await this.client.getBlockNumber();
    let finalized: bigint | null = null;
    if (this.network.finality.strategy === "finalized-tag") {
      const b = await this.client.getBlock({ blockTag: "finalized" });
      finalized = b.number;
    }
    return { head, finalized };
  }

  async blockMeta(blockNumber: bigint) {
    try {
      const b = await this.client.getBlock({ blockNumber });
      return { hash: b.hash as Hex, timestamp: Number(b.timestamp) };
    } catch {
      return null;
    }
  }

  confirmations(blockNumber: bigint, info: HeadInfo): number {
    return info.head >= blockNumber ? Number(info.head - blockNumber) + 1 : 0;
  }

  isFinal(blockNumber: bigint, info: HeadInfo): boolean {
    const f = this.network.finality;
    if (f.strategy === "finalized-tag") return info.finalized !== null && blockNumber <= info.finalized;
    return this.confirmations(blockNumber, info) >= f.confirmations;
  }

  /**
   * ALL ERC-20 Transfer events whose recipient is one of `addresses`, from any token contract.
   * Scanning every token (not just USDC) is what lets us flag unsupported-token deposits.
   */
  async scanTransfers(from: bigint, to: bigint, addresses: Address[]): Promise<ObservedTransfer[]> {
    const out: ObservedTransfer[] = [];
    if (addresses.length === 0 || to < from) return out;
    const emitter = this.network.nativeTransferEmitter;
    const native: ObservedTransfer[] = [];
    const chunk = 100;
    for (let i = 0; i < addresses.length; i += chunk) {
      const logs = await this.client.getLogs({
        event: erc20Transfer,
        args: { to: addresses.slice(i, i + chunk) },
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        // ERC-721 Transfer shares topic0 but has 4 topics; ERC-20 value lives in data.
        if (l.topics.length !== 3 || l.data.length !== 66) continue;
        if (l.blockNumber === null || l.logIndex === null || l.transactionHash === null || l.blockHash === null) continue;
        const seen: ObservedTransfer = {
          token: getAddress(l.address),
          from: getAddress(`0x${l.topics[1]!.slice(26)}`),
          to: getAddress(`0x${l.topics[2]!.slice(26)}`),
          value: BigInt(l.data),
          txHash: l.transactionHash,
          logIndex: l.logIndex,
          blockNumber: l.blockNumber,
          blockHash: l.blockHash,
        };
        // Arc logs every native USDC movement from a system address, in 18 decimals (EIP-7708). Those logs are the same asset as the token, not another token.
        if (emitter && isAddressEqual(l.address, emitter)) native.push(seen);
        else out.push(seen);
      }
    }
    if (this.symbol === "USDC") out.push(...this.foldNativeTransfers(native, out));
    return out.sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);
  }

  /**
   * Turn system-emitter logs into USDC deposits. An ERC-20 transfer() emits BOTH its own log and a system log for the same movement, so a
   * system log that has a matching ERC-20 log in the same transaction (same sender, recipient and amount, each used once) is dropped.
   * What remains is a plain native send, which has no ERC-20 log at all. Amounts below one token unit (6 decimals) are not payments.
   */
  private foldNativeTransfers(native: ObservedTransfer[], erc20: ObservedTransfer[]): ObservedTransfer[] {
    const used = new Set<ObservedTransfer>();
    const result: ObservedTransfer[] = [];
    for (const n of native) {
      const value = n.value / NATIVE_TO_TOKEN;
      if (value === 0n) continue;
      const twin = erc20.find(
        (t) => !used.has(t) && isAddressEqual(t.token, this.usdc) && t.txHash === n.txHash && isAddressEqual(t.from, n.from) && isAddressEqual(t.to, n.to) && t.value === value,
      );
      if (twin) {
        used.add(twin);
        continue;
      }
      result.push({ ...n, token: getAddress(this.usdc), value });
    }
    return result;
  }

  /** InvoicePaid events from the PaymentRouter for the given invoice ids (wallet checkout). */
  async scanRouterPayments(from: bigint, to: bigint, invoiceIds: Hex[]): Promise<ObservedRouterPayment[]> {
    const out: ObservedRouterPayment[] = [];
    if (invoiceIds.length === 0 || to < from) return out;
    for (let i = 0; i < invoiceIds.length; i += 100) {
      const logs = await this.client.getLogs({
        address: this.contracts.paymentRouter,
        event: invoicePaidEvent,
        args: { invoiceId: invoiceIds.slice(i, i + 100) },
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        if (l.blockNumber === null || l.logIndex === null || l.transactionHash === null || l.blockHash === null) continue;
        out.push({ ...normaliseKind(l.args as object), txHash: l.transactionHash, logIndex: l.logIndex, blockNumber: l.blockNumber, blockHash: l.blockHash, emitter: getAddress(l.address) } as ObservedRouterPayment);
      }
    }
    return out;
  }

  /** Swept events emitted by invoice clones (including sweeps triggered by third parties). */
  async scanSweeps(from: bigint, to: bigint, invoiceAddresses: Address[]): Promise<ObservedSweep[]> {
    const out: ObservedSweep[] = [];
    if (invoiceAddresses.length === 0 || to < from) return out;
    for (let i = 0; i < invoiceAddresses.length; i += 100) {
      const logs = await this.client.getLogs({ address: invoiceAddresses.slice(i, i + 100), event: sweptEvent, fromBlock: from, toBlock: to });
      for (const l of logs) {
        if (l.blockNumber === null || l.logIndex === null || l.transactionHash === null || l.blockHash === null) continue;
        out.push({ ...normaliseKind(l.args as object), emitter: getAddress(l.address), txHash: l.transactionHash, logIndex: l.logIndex, blockNumber: l.blockNumber, blockHash: l.blockHash } as ObservedSweep);
      }
    }
    return out;
  }

  /** Decode router/sweep logs from a receipt we submitted ourselves (same shape as the scans). */
  decodeReceiptEvents(receipt: { logs: readonly { address: Address; topics: readonly Hex[]; data: Hex; logIndex: number | null; transactionHash: Hex | null; blockNumber: bigint | null; blockHash: Hex | null }[] }) {
    const payments: ObservedRouterPayment[] = [];
    const sweeps: ObservedSweep[] = [];
    for (const l of receipt.logs) {
      if (l.logIndex === null || l.transactionHash === null || l.blockNumber === null || l.blockHash === null) continue;
      const base = { txHash: l.transactionHash, logIndex: l.logIndex, blockNumber: l.blockNumber, blockHash: l.blockHash, emitter: getAddress(l.address) };
      try {
        if (isAddressEqual(l.address, this.contracts.paymentRouter)) {
          const d = decodeEventLog({ abi: [invoicePaidEvent], data: l.data, topics: l.topics as [Hex, ...Hex[]] });
          payments.push({ ...normaliseKind(d.args as object), ...base } as ObservedRouterPayment);
          continue;
        }
        const d = decodeEventLog({ abi: [sweptEvent], data: l.data, topics: l.topics as [Hex, ...Hex[]] });
        sweeps.push({ ...normaliseKind(d.args as object), ...base } as ObservedSweep);
      } catch {
        /* unrelated log */
      }
    }
    return { payments, sweeps };
  }

  /**
   * Independent verification: re-fetch the receipt and decode the specific log instead of trusting
   * the getLogs response. Checks execution status, destination, emitting contract and amount.
   */
  async verifyTransfer(txHash: Hex, logIndex: number, expectedTo: Address): Promise<TransferVerification> {
    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: txHash });
    } catch {
      return { ok: false, reason: "receipt not found" };
    }
    if (receipt.status !== "success") return { ok: false, reason: "transaction reverted" };
    const log = receipt.logs.find((l) => l.logIndex === logIndex);
    if (!log) return { ok: false, reason: "log not found in receipt" };
    let decoded;
    try {
      decoded = decodeEventLog({ abi: [erc20Transfer], data: log.data, topics: log.topics });
    } catch {
      return { ok: false, reason: "log is not an ERC-20 Transfer" };
    }
    if (!isAddressEqual(decoded.args.to, expectedTo)) return { ok: false, reason: "recipient mismatch" };
    // A system-emitter log is the native view of USDC (18 decimals): same asset, amount in token units.
    const emitter = this.network.nativeTransferEmitter;
    const fromSystem = this.symbol === "USDC" && emitter !== undefined && isAddressEqual(log.address, emitter);
    const value = fromSystem ? decoded.args.value / NATIVE_TO_TOKEN : decoded.args.value;
    if (fromSystem && value === 0n) return { ok: false, reason: "native amount below one token unit" };
    const meta = await this.blockMeta(receipt.blockNumber);
    if (!meta) return { ok: false, reason: "block not found" };
    if (meta.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) return { ok: false, reason: "block hash changed" };
    return {
      ok: true,
      blockTimestamp: meta.timestamp,
      official: fromSystem || isAddressEqual(log.address, this.usdc),
      transfer: {
        token: fromSystem ? getAddress(this.usdc) : getAddress(log.address),
        from: decoded.args.from,
        to: decoded.args.to,
        value,
        txHash,
        logIndex,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      },
    };
  }

  // ------------------------------------------------------------------ reads

  async tokenBalanceOf(address: Address): Promise<bigint> {
    return this.usdcBalanceOf(address);
  }

  async usdcBalanceOf(address: Address): Promise<bigint> {
    return this.client.readContract({ address: this.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  }

  /**
   * Circle tokens expose `isBlacklisted(address)`. Returns null when this token has no such function (so the
   * caller can say "could not check" instead of guessing).
   */
  async isBlacklisted(address: Address): Promise<boolean | null> {
    try {
      return await this.client.readContract({
        address: this.usdc,
        abi: [{ type: "function", name: "isBlacklisted", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "bool" }] }] as const,
        functionName: "isBlacklisted",
        args: [address],
      });
    } catch {
      return null;
    }
  }

  async hasCode(address: Address): Promise<boolean> {
    const code = await this.client.getCode({ address });
    return !!code && code !== "0x";
  }

  predictInvoiceAddress(route: InvoiceRoute, merchantId: Hex, invoiceId: Hex): Address {
    return computeInvoiceAddress({
      factory: this.contracts.invoiceFactory,
      implementation: this.contracts.invoiceImplementation,
      token: this.usdc,
      treasury: this.deployment.treasury,
      ...route,
      merchantId,
      invoiceId,
      chainId: this.network.chainId,
      version: this.contracts.version,
    });
  }

  /** The factory's own prediction, used to cross-check the offline derivation before showing an address. */
  async predictInvoiceAddressOnChain(route: InvoiceRoute, merchantId: Hex, invoiceId: Hex): Promise<Address> {
    return this.client.readContract({
      address: this.contracts.invoiceFactory,
      abi: InvoiceFactoryAbi,
      functionName: "predict",
      args: [merchantId, invoiceId, route.destination, destinationKindIndex(route.kind), route.feeBps],
    });
  }

  /**
   * Read what the deployed contracts say about themselves (token, chain, version, treasury, fee cap) so the
   * engine and the deploy tooling can compare it with the registry and the deployment record.
   */
  async readDeploymentFacts(): Promise<DeploymentFacts> {
    const d = { ...this.deployment, ...this.contracts };
    const call = <T,>(address: Address, abi: readonly unknown[], fn: string) =>
      this.client.readContract({ address, abi: abi as never, functionName: fn as never }) as Promise<T>;
    const [iToken, iChain, iVersion, iTreasury, iMax] = await Promise.all([
      call<Address>(d.invoiceImplementation, InvoiceDepositAbi, "TOKEN"),
      call<bigint>(d.invoiceImplementation, InvoiceDepositAbi, "CHAIN_ID"),
      call<number>(d.invoiceImplementation, InvoiceDepositAbi, "VERSION"),
      call<Address>(d.invoiceImplementation, InvoiceDepositAbi, "TREASURY"),
      call<number>(d.invoiceImplementation, InvoiceDepositAbi, "MAX_FEE_BPS"),
    ]);
    const [fImpl, fToken, fVaults, fChain, fVersion, fTreasury, fMax] = await Promise.all([
      call<Address>(d.invoiceFactory, InvoiceFactoryAbi, "IMPLEMENTATION"),
      call<Address>(d.invoiceFactory, InvoiceFactoryAbi, "TOKEN"),
      call<Address>(d.invoiceFactory, InvoiceFactoryAbi, "VAULTS"),
      call<bigint>(d.invoiceFactory, InvoiceFactoryAbi, "CHAIN_ID"),
      call<number>(d.invoiceFactory, InvoiceFactoryAbi, "VERSION"),
      call<Address>(d.invoiceFactory, InvoiceFactoryAbi, "TREASURY"),
      call<number>(d.invoiceFactory, InvoiceFactoryAbi, "MAX_FEE_BPS"),
    ]);
    const [rToken, rVaults, rTreasury, rMax] = await Promise.all([
      call<Address>(d.paymentRouter, PaymentRouterAbi, "TOKEN"),
      call<Address>(d.paymentRouter, PaymentRouterAbi, "VAULTS"),
      call<Address>(d.paymentRouter, PaymentRouterAbi, "TREASURY"),
      call<number>(d.paymentRouter, PaymentRouterAbi, "MAX_FEE_BPS"),
    ]);
    return {
      implementation: { token: getAddress(iToken), chainId: Number(iChain), version: Number(iVersion), treasury: getAddress(iTreasury), maxFeeBps: Number(iMax) },
      factory: { implementation: getAddress(fImpl), token: getAddress(fToken), vaults: getAddress(fVaults), chainId: Number(fChain), version: Number(fVersion), treasury: getAddress(fTreasury), maxFeeBps: Number(fMax) },
      router: { token: getAddress(rToken), vaults: getAddress(rVaults), treasury: getAddress(rTreasury), maxFeeBps: Number(rMax) },
      treasuryHasCode: await this.hasCode(getAddress(iTreasury)),
    };
  }

  async predictVault(merchantId: Hex, owner: Address): Promise<Address> {
    return this.client.readContract({
      address: this.contracts.vaultFactory,
      abi: VaultFactoryAbi,
      functionName: "predictVault",
      args: [merchantId, owner, BigInt(this.deployment.vaultConfigDelaySeconds)],
    });
  }

  async isRegisteredVault(vault: Address): Promise<boolean> {
    return this.client.readContract({ address: this.contracts.vaultFactory, abi: VaultFactoryAbi, functionName: "isVault", args: [vault] });
  }

  async readVault(vault: Address): Promise<VaultState> {
    const read = <T extends string>(fn: T) =>
      this.client.readContract({ address: vault, abi: MerchantVaultAbi, functionName: fn as never }) as Promise<any>;
    const [owner, pendingOwner, settlement, configDelay, balance, can, pending] = await Promise.all([
      read("owner"),
      read("pendingOwner"),
      read("settlement"),
      read("CONFIG_DELAY"),
      read("balance"),
      read("canForward"),
      read("pendingSettlement"),
    ]);
    return {
      address: vault,
      owner,
      pendingOwner,
      mode: MODES[Number(settlement.mode)]!,
      destination: settlement.destination,
      threshold: BigInt(settlement.threshold),
      interval: BigInt(settlement.interval),
      configDelay: BigInt(configDelay),
      balance,
      canForward: can[0] as boolean,
      pending: BigInt(pending.effectiveAt) === 0n ? null : { effectiveAt: BigInt(pending.effectiveAt), mode: MODES[Number(pending.settlement.mode)]!, destination: pending.settlement.destination },
    };
  }

  async isAuthorizationUsed(authorizer: Address, nonce: Hex): Promise<boolean> {
    return this.client.readContract({
      address: this.usdc,
      abi: [
        { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }], outputs: [{ type: "bool" }] },
      ] as const,
      functionName: "authorizationState",
      args: [authorizer, nonce],
    });
  }

  // ------------------------------------------------------------------ calldata (relayer-submitted)

  encodeDeployAndSweep(merchantId: Hex, invoiceId: Hex, route: InvoiceRoute): { to: Address; data: Hex } {
    return {
      to: this.contracts.invoiceFactory,
      data: encodeFunctionData({
        abi: InvoiceFactoryAbi,
        functionName: "deployAndSweep",
        args: [merchantId, invoiceId, route.destination, destinationKindIndex(route.kind), route.feeBps],
      }),
    };
  }

  encodeCreateVault(merchantId: Hex, owner: Address): { to: Address; data: Hex } {
    return {
      to: this.contracts.vaultFactory,
      data: encodeFunctionData({
        abi: VaultFactoryAbi,
        functionName: "createVault",
        args: [merchantId, owner, BigInt(this.deployment.vaultConfigDelaySeconds)],
      }),
    };
  }

  encodeApplyPending(vault: Address): { to: Address; data: Hex } {
    return { to: vault, data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "applyPendingSettlement" }) };
  }

  encodeForward(vault: Address): { to: Address; data: Hex } {
    return { to: vault, data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "forward" }) };
  }

  encodePay(p: RouterPayment, v: number, r: Hex, s: Hex): { to: Address; data: Hex } {
    return {
      to: this.contracts.paymentRouter,
      data: encodeFunctionData({ abi: PaymentRouterAbi, functionName: "pay", args: [p, v, r, s] }),
    };
  }
}
