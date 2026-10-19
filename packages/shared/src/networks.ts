import type { Address } from "viem";

/**
 * Central network registry. Static facts only (chain id, official USDC, capabilities).
 * Deployed contract addresses live in `deployments/<id>.json` and are merged at runtime, so a
 * network cannot be operational without a recorded, verified deployment.
 *
 * Every USDC address below comes from Circle's official list
 * (https://developers.circle.com/stablecoins/usdc-contract-addresses) and was probed on-chain on
 * `verifiedAt` (see scripts/verify-networks.ts). Never edit an address from any other source.
 */
export type NetworkId =
  | "arc-testnet"
  | "base-sepolia"
  | "arc-mainnet"
  | "base-mainnet"
  | "arbitrum-mainnet"
  | "optimism-mainnet"
  | "polygon-mainnet"
  | "ethereum-mainnet"
  | "avalanche-mainnet"
  | "celo-mainnet"
  | "codex-mainnet"
  | "cronos-mainnet"
  | "hyperevm-mainnet"
  | "injective-mainnet"
  | "ink-mainnet"
  | "linea-mainnet"
  | "monad-mainnet"
  | "morph-mainnet"
  | "plasma-mainnet"
  | "plume-mainnet"
  | "sei-mainnet"
  | "sonic-mainnet"
  | "unichain-mainnet"
  | "worldchain-mainnet"
  | "xlayer-mainnet"
  | "xdc-mainnet";

export interface FinalityPolicy {
  /** `confirmations`: head - block + 1 >= n.  `finalized-tag`: block <= the chain's finalized block. */
  strategy: "confirmations" | "finalized-tag";
  confirmations: number;
  note: string;
}

/**
 * Payment tokens the gateway can accept. USDC is on every network; others are listed per network only when the
 * network's own official documentation lists them (see `extraTokens`). Every supported token has 6 decimals: the
 * code checks it rather than assuming it.
 */
export const TOKEN_SYMBOLS = ["USDC", "EURC"] as const;
export type TokenSymbol = (typeof TOKEN_SYMBOLS)[number];
export const isTokenSymbol = (s: string): s is TokenSymbol => (TOKEN_SYMBOLS as readonly string[]).includes(s);

export interface TokenConfig {
  symbol: TokenSymbol;
  address: Address;
  decimals: 6;
  eip712: { name: string; version: string };
  /** What the token's contract was probed to support. Wallet checkout needs receiveWithAuthorization. */
  authorization: NetworkConfig["authorization"];
  /** Where the address comes from, so the next person can check it. */
  source?: string;
}

export interface NetworkConfig {
  /** Built-in ids are `NetworkId`; local/dev networks may use any slug (e.g. `local-dev`). */
  id: string;
  chainId: number;
  name: string;
  environment: "testnet" | "mainnet";
  nativeCurrency: { symbol: string; decimals: number };
  /** Public defaults for development. Production must override with dedicated providers. */
  rpcUrls: string[];
  explorerUrl: string;
  usdc: {
    address: Address;
    decimals: 6;
    symbol: "USDC";
    eip712: { name: string; version: string };
  };
  authorization: {
    transferWithAuthorization: boolean;
    receiveWithAuthorization: boolean;
    permit: boolean;
    /** true only if the receive/transfer selectors were probed on this chain's official token. */
    verified: boolean;
    verifiedAt: string | null;
  };
  gas: {
    model: "usdc-native" | "eth";
    /** Arc rejects maxFeePerGas below this floor (wei, 18-dec native units). */
    minMaxFeePerGasWei?: bigint;
  };
  finality: FinalityPolicy;
  circle: {
    cctpDomain: number | null;
    /** Product support is independent of USDC support. null = not verified, do not rely on it. */
    gatewayNanopayments: boolean | null;
    gasStation: boolean | null;
  };
  /** Max block range per eth_getLogs request on typical public RPCs for this chain. */
  maxLogRange: number;
  /** Arc: native USDC movements (plain sends, contract endowments) are logged as ERC-20-style Transfer events with 18 decimals by this system address (EIP-7708). */
  nativeTransferEmitter?: Address;
  /** Arc: the Memo contract. It forwards a call and emits the memo id and data while the original sender stays the caller. */
  memoContract?: Address;
  /** Further official payment tokens on this network (USDC is `usdc`). Each needs its own contracts. */
  extraTokens?: Partial<Record<TokenSymbol, TokenConfig>>;
}

/** All payment tokens of a network, USDC included, in one shape. */
export function networkTokens(net: NetworkConfig): Partial<Record<TokenSymbol, TokenConfig>> {
  return {
    USDC: { symbol: "USDC", address: net.usdc.address, decimals: 6, eip712: net.usdc.eip712, authorization: net.authorization },
    ...(net.extraTokens ?? {}),
  };
}

export function tokenOf(net: NetworkConfig, symbol: string): TokenConfig | undefined {
  return isTokenSymbol(symbol) ? networkTokens(net)[symbol] : undefined;
}

const GWEI = 1_000_000_000n;

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  "arc-testnet": {
    id: "arc-testnet",
    chainId: 5042002,
    name: "Arc Testnet",
    environment: "testnet",
    nativeCurrency: { symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.testnet.arc.io"],
    explorerUrl: "https://explorer.testnet.arc.io",
    usdc: {
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "usdc-native", minMaxFeePerGasWei: 20n * GWEI },
    finality: {
      strategy: "confirmations",
      confirmations: 1,
      note: "Arc provides deterministic finality; inclusion in a block is final. Re-verify before mainnet.",
    },
    circle: { cctpDomain: 26, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 2000,
    nativeTransferEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
    memoContract: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    extraTokens: {
      EURC: {
        symbol: "EURC",
        address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        decimals: 6,
        eip712: { name: "EURC", version: "2" },
        authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
        source: "https://docs.arc.io/arc/references/contract-addresses (Testnet tab)",
      },
    },
  },
  "base-sepolia": {
    id: "base-sepolia",
    chainId: 84532,
    name: "Base Sepolia",
    environment: "testnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    explorerUrl: "https://sepolia.basescan.org",
    usdc: {
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 12, note: "L2 soft confirmations; reorgs are rare but possible." },
    circle: { cctpDomain: 6, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
  "arc-mainnet": {
    id: "arc-mainnet",
    chainId: 5042,
    name: "Arc",
    environment: "mainnet",
    nativeCurrency: { symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.arc.io"],
    explorerUrl: "https://explorer.arc.io",
    usdc: {
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "usdc-native", minMaxFeePerGasWei: 20n * GWEI },
    finality: {
      strategy: "confirmations",
      confirmations: 1,
      note: "Deterministic finality per Arc documentation; confirm parameters against mainnet before enabling.",
    },
    circle: { cctpDomain: 26, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 2000,
    nativeTransferEmitter: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE",
    memoContract: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    extraTokens: {
      EURC: {
        symbol: "EURC",
        address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
        decimals: 6,
        eip712: { name: "EURC", version: "2" },
        authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
        source: "https://docs.arc.io/arc/references/contract-addresses (Mainnet tab)",
      },
    },
  },
  "base-mainnet": {
    id: "base-mainnet",
    chainId: 8453,
    name: "Base",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    explorerUrl: "https://basescan.org",
    usdc: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "Conservative L2 depth; tune per risk appetite." },
    circle: { cctpDomain: 6, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
  "arbitrum-mainnet": {
    id: "arbitrum-mainnet",
    chainId: 42161,
    name: "Arbitrum One",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    explorerUrl: "https://arbiscan.io",
    usdc: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "Conservative L2 depth; tune per risk appetite." },
    circle: { cctpDomain: 3, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 10000,
  },
  "optimism-mainnet": {
    id: "optimism-mainnet",
    chainId: 10,
    name: "OP Mainnet",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.optimism.io"],
    explorerUrl: "https://optimistic.etherscan.io",
    usdc: {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "Conservative L2 depth; tune per risk appetite." },
    circle: { cctpDomain: 2, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
  "polygon-mainnet": {
    id: "polygon-mainnet",
    chainId: 137,
    name: "Polygon PoS",
    environment: "mainnet",
    nativeCurrency: { symbol: "POL", decimals: 18 },
    rpcUrls: [],
    explorerUrl: "https://polygonscan.com",
    usdc: {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    // Not probed: no working public RPC was available. Do not enable until verified.
    authorization: {
      transferWithAuthorization: false,
      receiveWithAuthorization: false,
      permit: false,
      verified: false,
      verifiedAt: null,
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 128, note: "Polygon PoS reorg depth; verify before use." },
    circle: { cctpDomain: 7, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 3000,
  },
  "ethereum-mainnet": {
    id: "ethereum-mainnet",
    chainId: 1,
    name: "Ethereum",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-rpc.publicnode.com"],
    explorerUrl: "https://etherscan.io",
    usdc: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "Wait for the finalized block (~13 min)." },
    circle: { cctpDomain: 0, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
  "avalanche-mainnet": {
    id: "avalanche-mainnet",
    chainId: 43114,
    name: "Avalanche C-Chain",
    environment: "mainnet",
    nativeCurrency: { symbol: "AVAX", decimals: 18 },
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
    explorerUrl: "https://snowscan.xyz",
    usdc: {
      address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 2 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "celo-mainnet": {
    id: "celo-mainnet",
    chainId: 42220,
    name: "Celo",
    environment: "mainnet",
    nativeCurrency: { symbol: "CELO", decimals: 18 },
    rpcUrls: ["https://forno.celo.org"],
    explorerUrl: "https://celoscan.io",
    usdc: {
      address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 1372 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "codex-mainnet": {
    id: "codex-mainnet",
    chainId: 81224,
    name: "Codex",
    environment: "mainnet",
    nativeCurrency: { symbol: "native", decimals: 18 },
    rpcUrls: ["https://rpc.codex.xyz"],
    explorerUrl: "https://explorer.codex.xyz",
    usdc: {
      address: "0xd996633a415985DBd7D6D12f4A4343E31f5037cf",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 530 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "cronos-mainnet": {
    id: "cronos-mainnet",
    chainId: 25,
    name: "Cronos",
    environment: "mainnet",
    nativeCurrency: { symbol: "CRO", decimals: 18 },
    rpcUrls: ["https://evm.cronos.org"],
    explorerUrl: "https://cronoscan.com",
    usdc: {
      address: "0x3D7F2C478aAfdB65542BCB44bCeeC05849999d2D",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "This chain's RPC offers no finalized tag. 20 confirmations is a conservative floor chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "hyperevm-mainnet": {
    id: "hyperevm-mainnet",
    chainId: 999,
    name: "HyperEVM",
    environment: "mainnet",
    nativeCurrency: { symbol: "HYPE", decimals: 18 },
    rpcUrls: ["https://rpc.hyperliquid.xyz/evm"],
    explorerUrl: "https://hyperevmscan.io",
    usdc: {
      address: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "This chain's RPC offers no finalized tag. 20 confirmations is a conservative floor chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 500,
  },
  "injective-mainnet": {
    id: "injective-mainnet",
    chainId: 1776,
    name: "Injective",
    environment: "mainnet",
    nativeCurrency: { symbol: "INJ", decimals: 18 },
    rpcUrls: ["https://sentry.evm-rpc.injective.network"],
    explorerUrl: "https://blockscout.injective.network",
    usdc: {
      address: "0xa00C59fF5a080D2b954d0c75e46E22a0c371235a",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "This chain's RPC offers no finalized tag. 20 confirmations is a conservative floor chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "ink-mainnet": {
    id: "ink-mainnet",
    chainId: 57073,
    name: "Ink",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc-gel.inkonchain.com"],
    explorerUrl: "https://explorer.inkonchain.com",
    usdc: {
      address: "0x2D270e6886d130D724215A266106e6832161EAEd",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 1479 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "linea-mainnet": {
    id: "linea-mainnet",
    chainId: 59144,
    name: "Linea",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.linea.build"],
    explorerUrl: "https://lineascan.build",
    usdc: {
      address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 1643 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "monad-mainnet": {
    id: "monad-mainnet",
    chainId: 143,
    name: "Monad",
    environment: "mainnet",
    nativeCurrency: { symbol: "MON", decimals: 18 },
    rpcUrls: ["https://rpc.monad.xyz"],
    explorerUrl: "https://monadscan.com",
    usdc: {
      address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 1 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 100,
  },
  "morph-mainnet": {
    id: "morph-mainnet",
    chainId: 2818,
    name: "Morph",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.morphl2.io"],
    explorerUrl: "https://explorer.morphl2.io",
    usdc: {
      address: "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 813 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "plasma-mainnet": {
    id: "plasma-mainnet",
    chainId: 9745,
    name: "Plasma",
    environment: "mainnet",
    nativeCurrency: { symbol: "XPL", decimals: 18 },
    rpcUrls: ["https://rpc.plasma.to"],
    explorerUrl: "https://plasmascan.to",
    usdc: {
      address: "0x2d661C89D812261039AF9764eceaAee884f5F67F",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 1 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "plume-mainnet": {
    id: "plume-mainnet",
    chainId: 98866,
    name: "Plume",
    environment: "mainnet",
    nativeCurrency: { symbol: "PLUME", decimals: 18 },
    rpcUrls: ["https://rpc.plume.org"],
    explorerUrl: "https://explorer.plume.org",
    usdc: {
      address: "0x222365EF19F7947e5484218551B56bb3965Aa7aF",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 3641 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "sei-mainnet": {
    id: "sei-mainnet",
    chainId: 1329,
    name: "Sei",
    environment: "mainnet",
    nativeCurrency: { symbol: "SEI", decimals: 18 },
    rpcUrls: ["https://sei-evm-rpc.publicnode.com"],
    explorerUrl: "https://seitrace.com",
    usdc: {
      address: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "This chain's RPC offers no finalized tag. 20 confirmations is a conservative floor chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "sonic-mainnet": {
    id: "sonic-mainnet",
    chainId: 146,
    name: "Sonic",
    environment: "mainnet",
    nativeCurrency: { symbol: "S", decimals: 18 },
    rpcUrls: ["https://rpc.soniclabs.com"],
    explorerUrl: "https://sonicscan.org",
    usdc: {
      address: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 0 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "unichain-mainnet": {
    id: "unichain-mainnet",
    chainId: 130,
    name: "Unichain",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.unichain.org"],
    explorerUrl: "https://uniscan.xyz",
    usdc: {
      address: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 1382 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
  "worldchain-mainnet": {
    id: "worldchain-mainnet",
    chainId: 480,
    name: "World Chain",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://worldchain-mainnet.g.alchemy.com/public"],
    explorerUrl: "https://worldscan.org",
    usdc: {
      address: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 599 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 100,
  },
  "xlayer-mainnet": {
    id: "xlayer-mainnet",
    chainId: 196,
    name: "X Layer",
    environment: "mainnet",
    nativeCurrency: { symbol: "OKB", decimals: 18 },
    rpcUrls: ["https://rpc.xlayer.tech"],
    explorerUrl: "https://www.oklink.com/xlayer",
    usdc: {
      address: "0xB6CEceAB302E2E4948951eE7843FC24E92933061",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 1168 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 100,
  },
  "xdc-mainnet": {
    id: "xdc-mainnet",
    chainId: 50,
    name: "XDC",
    environment: "mainnet",
    nativeCurrency: { symbol: "XDC", decimals: 18 },
    rpcUrls: ["https://rpc.ankr.com/xdc"],
    explorerUrl: "https://xdcscan.com",
    usdc: {
      address: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: true, verified: true, verifiedAt: "2026-10-15" },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "The chain's own finalized block (about 2 blocks behind the head when probed 2026-10-15). Chosen by us; confirm against the chain's documentation before enabling." },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 1000,
  },
};

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

export function getNetwork(id: string): NetworkConfig {
  const n = (NETWORKS as Record<string, NetworkConfig | undefined>)[id];
  if (!n) throw new Error(`Unknown network: ${id}`);
  return n;
}

export function tryGetNetwork(id: string): NetworkConfig | undefined {
  return (NETWORKS as Record<string, NetworkConfig | undefined>)[id];
}

/** The contracts that serve ONE token on ONE chain. The token is an immutable of each, so an address commits to it. */
export interface TokenContracts {
  vaultFactory: Address;
  invoiceImplementation: Address;
  invoiceFactory: Address;
  paymentRouter: Address;
  version: number;
  deployBlock?: number;
  /** Set by finalize-deployment after comparing the on-chain bytecode with the build. */
  bytecodeVerified?: boolean;
}

/** Contract deployment record written by contracts/script/Deploy.s.sol + scripts/record-deployment.ts. */
export interface Deployment {
  networkId: string;
  chainId: number;
  version: number;
  vaultFactory: Address;
  invoiceImplementation: Address;
  invoiceFactory: Address;
  paymentRouter: Address;
  /** Platform fee recipient baked into the implementation and the router (immutable). */
  treasury: Address;
  /** Immutable cap on any invoice's fee, in basis points. */
  maxFeeBps: number;
  deployBlock: number;
  deployer: Address;
  /** Set only after bytecode on the target chain was compared with the audited build artifacts. */
  bytecodeVerified: boolean;
  /** Set by a human after reviewing explorer verification + operational readiness. Required for mainnet. */
  productionApproved: boolean;
  vaultConfigDelaySeconds: number;
  /** Contract sets for further payment tokens (EURC on Arc). The fields above are the USDC set. */
  tokens?: Partial<Record<TokenSymbol, TokenContracts>>;
}

/** The contracts for a token on this deployment: the top-level set for USDC, `tokens[symbol]` for the rest. */
export function contractsFor(d: Deployment, symbol: TokenSymbol): TokenContracts | undefined {
  if (symbol === "USDC") {
    return { vaultFactory: d.vaultFactory, invoiceImplementation: d.invoiceImplementation, invoiceFactory: d.invoiceFactory, paymentRouter: d.paymentRouter, version: d.version, deployBlock: d.deployBlock, bytecodeVerified: d.bytecodeVerified };
  }
  return d.tokens?.[symbol];
}

export interface OperationalGate {
  operational: boolean;
  reasons: string[];
}

/**
 * A network is operational only when: it is listed in ENABLED_NETWORKS, its token behaviour was
 * probed, a deployment record matches its chain id, and (for mainnets) the operator explicitly
 * allowed mainnet AND a human flagged the deployment productionApproved.
 */
export function operationalGate(
  net: NetworkConfig,
  deployment: Deployment | undefined,
  env: { enabledNetworks: string[]; allowMainnet: boolean },
): OperationalGate {
  const reasons: string[] = [];
  if (!env.enabledNetworks.includes(net.id)) reasons.push("not listed in ENABLED_NETWORKS");
  if (!net.authorization.verified) reasons.push("USDC capabilities not verified");
  if (net.rpcUrls.length === 0) reasons.push("no RPC configured");
  if (!deployment) reasons.push("no deployment record");
  else {
    if (deployment.chainId !== net.chainId) reasons.push("deployment chain id mismatch");
    if (!deployment.bytecodeVerified) reasons.push("deployed bytecode not verified");
  }
  if (net.environment === "mainnet") {
    if (!env.allowMainnet) reasons.push("ALLOW_MAINNET is not true");
    if (deployment && !deployment.productionApproved) reasons.push("deployment not productionApproved");
  }
  return { operational: reasons.length === 0, reasons };
}
