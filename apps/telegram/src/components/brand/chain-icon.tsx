import type { ComponentType } from "react";
import { Boxes } from "lucide-react";
import type { NetworkId } from "@plinth/shared";
import {
  NetworkArbitrumOne,
  NetworkArc,
  NetworkAvalanche,
  NetworkBase,
  NetworkEthereum,
  NetworkOptimism,
  NetworkPolygon,
} from "@web3icons/react";
import { cn } from "@/lib/cn";
import { TokenIcon, type TokenSymbol } from "./token-icon";

type Mark = { Icon: ComponentType<{ variant?: "branded" | "mono" | "background"; size?: number | string; className?: string }>; variant: "branded" | "background"; tile: boolean };
type Family = "arc" | "base" | "ethereum" | "arbitrum" | "optimism" | "polygon" | "avalanche" | "other" | "local";

/**
 * Arc and Polygon use the "background" variant: their branded variants are white on transparent and
 * vanish on light surfaces. Background variants are square tiles, so they are rounded to match the others.
 */
const marks: Record<Exclude<Family, "local" | "other">, Mark> = {
  arc: { Icon: NetworkArc, variant: "background", tile: true },
  base: { Icon: NetworkBase, variant: "branded", tile: true },
  ethereum: { Icon: NetworkEthereum, variant: "branded", tile: false },
  arbitrum: { Icon: NetworkArbitrumOne, variant: "branded", tile: false },
  optimism: { Icon: NetworkOptimism, variant: "branded", tile: false },
  polygon: { Icon: NetworkPolygon, variant: "background", tile: true },
  avalanche: { Icon: NetworkAvalanche, variant: "branded", tile: false },
};

const TILE_BG: Partial<Record<Family, string>> = {
  arc: "linear-gradient(180deg, #182680, #842D56)",
  polygon: "linear-gradient(120deg, #A726C1, #803BDF 88%, #7B3FE4)",
};

/** Names and environments mirror packages/shared/src/networks.ts. Record<NetworkId, ...> makes tsc flag a new registry id. */
const registry: Record<NetworkId, { family: Family; name: string; testnet: boolean }> = {
  "arc-testnet": { family: "arc", name: "Arc Testnet", testnet: true },
  "base-sepolia": { family: "base", name: "Base Sepolia", testnet: true },
  "arc-mainnet": { family: "arc", name: "Arc", testnet: false },
  "base-mainnet": { family: "base", name: "Base", testnet: false },
  "arbitrum-mainnet": { family: "arbitrum", name: "Arbitrum One", testnet: false },
  "optimism-mainnet": { family: "optimism", name: "OP Mainnet", testnet: false },
  "polygon-mainnet": { family: "polygon", name: "Polygon PoS", testnet: false },
  "ethereum-mainnet": { family: "ethereum", name: "Ethereum", testnet: false },
  "avalanche-mainnet": { family: "avalanche", name: "Avalanche C-Chain", testnet: false },
  "celo-mainnet": { family: "other", name: "Celo", testnet: false },
  "codex-mainnet": { family: "other", name: "Codex", testnet: false },
  "cronos-mainnet": { family: "other", name: "Cronos", testnet: false },
  "hyperevm-mainnet": { family: "other", name: "HyperEVM", testnet: false },
  "injective-mainnet": { family: "other", name: "Injective", testnet: false },
  "ink-mainnet": { family: "other", name: "Ink", testnet: false },
  "linea-mainnet": { family: "other", name: "Linea", testnet: false },
  "monad-mainnet": { family: "other", name: "Monad", testnet: false },
  "morph-mainnet": { family: "other", name: "Morph", testnet: false },
  "plasma-mainnet": { family: "other", name: "Plasma", testnet: false },
  "plume-mainnet": { family: "other", name: "Plume", testnet: false },
  "sei-mainnet": { family: "other", name: "Sei", testnet: false },
  "sonic-mainnet": { family: "other", name: "Sonic", testnet: false },
  "unichain-mainnet": { family: "other", name: "Unichain", testnet: false },
  "worldchain-mainnet": { family: "other", name: "World Chain", testnet: false },
  "xlayer-mainnet": { family: "other", name: "X Layer", testnet: false },
  "xdc-mainnet": { family: "other", name: "XDC", testnet: false },
};

const familyNames: Record<Family, string> = { arc: "Arc", base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum One", optimism: "OP Mainnet", polygon: "Polygon PoS", avalanche: "Avalanche", other: "Network", local: "Local dev chain" };

export interface ChainMeta { family: Family; name: string; testnet: boolean }

/** Resolve a Plinth network id (or a loose alias such as "base", "ethereum", "local-dev") to its mark family, display name and environment. */
export function chainMeta(id: string): ChainMeta {
  const known = (registry as Record<string, ChainMeta | undefined>)[id];
  if (known) return known;
  const low = id.toLowerCase();
  const head = low.split(/[-_ ]/)[0] ?? "";
  const family: Family = head in marks ? (head as Family) : head === "op" ? "optimism" : head === "arb" ? "arbitrum" : head === "avax" ? "avalanche" : head === "eth" ? "ethereum" : "local";
  const testnet = /sepolia|testnet|fuji|amoy|goerli|local|dev/.test(low);
  return { family, name: family === "local" ? (/^(local|dev)/.test(low) || !id ? familyNames.local : id) : familyNames[family], testnet };
}

const byChainId: Record<number, NetworkId> = { 5042002: "arc-testnet", 84532: "base-sepolia", 5042: "arc-mainnet", 8453: "base-mainnet", 42161: "arbitrum-mainnet", 10: "optimism-mainnet", 137: "polygon-mainnet", 1: "ethereum-mainnet" };

/** EVM chain id to Plinth network id; unknown chains (for example a local dev chain) resolve to "local-dev". */
export function networkIdForChainId(chainId: number): NetworkId | "local-dev" {
  return byChainId[chainId] ?? "local-dev";
}

/**
 * Network mark. Testnets share the mainnet mark (a testnet mark is never invented); `testnet` only labels the
 * icon for assistive tech. Pair with ChainBadge to show the visible "Testnet" chip.
 */
export function ChainIcon({ id, size = 20, testnet, className }: { id: NetworkId | (string & {}); size?: number; testnet?: boolean; className?: string }) {
  const meta = chainMeta(id);
  const label = `${meta.name}${(testnet ?? meta.testnet) && !/testnet|sepolia/i.test(meta.name) ? " (testnet)" : ""}`;
  if (meta.family === "local" || meta.family === "other") {
    return (
      <span role="img" aria-label={label} className={cn("inline-grid shrink-0 place-items-center bg-sunk text-ink-2", className)} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>
        <Boxes style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={1.75} aria-hidden />
      </span>
    );
  }
  const m = marks[meta.family as Exclude<Family, "local" | "other">];
  // The library's gradient tiles reference ids such as "arc__b". With many copies on a page, the first copy can sit inside a hidden
  // (display: none) layout and every other copy then paints nothing. These two are drawn as a CSS gradient with the one-colour glyph instead.
  const flat = TILE_BG[meta.family];
  if (flat) {
    return (
      <span role="img" aria-label={label} className={cn("inline-grid shrink-0 place-items-center overflow-hidden text-white", className)} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: flat }}>
        <m.Icon variant="mono" size={Math.round(size * 0.83)} />
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} className={cn("inline-flex shrink-0", m.tile && "overflow-hidden", className)} style={{ width: size, height: size, borderRadius: m.tile ? Math.round(size * 0.28) : undefined }}>
      <m.Icon variant={m.variant} size={size} />
    </span>
  );
}

/** Icon, network name and an optional neutral "Testnet" chip. */
export function ChainBadge({ id, size = 20, showTestnet = true, className }: { id: NetworkId | (string & {}); size?: number; showTestnet?: boolean; className?: string }) {
  const meta = chainMeta(id);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-ink", className)}>
      <ChainIcon id={id} size={size} />
      <span className="truncate font-medium">{meta.name}</span>
      {showTestnet && meta.testnet && <span className="rounded-full bg-sunk px-1.5 py-0.5 text-2xs font-medium leading-none text-ink-2">Testnet</span>}
    </span>
  );
}

/** A token with its network mark overlapping the lower right corner: the standard "asset on chain" pattern. */
export function AssetOnChain({ symbol, id, size = 28, className }: { symbol: TokenSymbol | (string & {}); id: NetworkId | (string & {}); size?: number; className?: string }) {
  const badge = Math.max(12, Math.round(size * 0.46));
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <TokenIcon symbol={symbol} size={size} />
      <span className="absolute rounded-full bg-raised p-px ring-1 ring-raised" style={{ right: -Math.round(badge * 0.2), bottom: -Math.round(badge * 0.2) }}>
        <ChainIcon id={id} size={badge - 2} />
      </span>
    </span>
  );
}
