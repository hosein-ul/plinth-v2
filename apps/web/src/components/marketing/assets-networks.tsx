import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NETWORKS } from "@plinth/shared";
import { AssetOnChain, ChainIcon, WalletIcon } from "@/components/brand";
import { Chip } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { Marquee } from "@/components/marketing/motion/marquee";
import { Tilt } from "@/components/marketing/motion/tilt";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { Spotlight } from "@/components/marketing/motion/spotlight";
import { wrap } from "@/components/marketing/parts";
import { readLiveNetworks } from "@/lib/live-networks";
import { cn } from "@/lib/cn";

const WALLETS: [id: string, name: string][] = [
  ["metamask", "MetaMask"],
  ["coinbase", "Coinbase Wallet"],
  ["rainbow", "Rainbow"],
  ["walletconnect", "WalletConnect"],
  ["phantom", "Phantom"],
  ["trust", "Trust Wallet"],
  ["ledger", "Ledger"],
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Networks, from two real sources: the registry (every network with Circle-native USDC and its official contract) and the running
 * API's public status (which of them are open for payments right now). A network is only called live when the API says so; if the
 * API cannot be read, no status is shown at all.
 */
export async function AssetsNetworks() {
  const mainnets = Object.values(NETWORKS).filter((n) => n.environment === "mainnet");
  const live = await readLiveNetworks();
  const liveIds = new Set((live ?? []).filter((n) => n.operational && n.environment === "mainnet").map((n) => n.id));
  const liveNets = mainnets.filter((n) => liveIds.has(n.id));
  const soon = mainnets.length - liveNets.length;
  const reading = (id: string) => live?.find((n) => n.id === id);
  const sorted = [...liveNets, ...mainnets.filter((n) => !liveIds.has(n.id))];
  const rows = [sorted.slice(0, Math.ceil(sorted.length / 2)), sorted.slice(Math.ceil(sorted.length / 2))];

  return (
    <Band tone="light" labelledBy="assets-h">
      <div className={cn(wrap, "relative")}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="flex items-center gap-3">
              <AssetOnChain symbol="USDC" id="arc-mainnet" size={44} />
              <p className="text-sm text-ink-3">USDC, the only asset Plinth counts</p>
            </div>
            <RevealHeading as="h2" id="assets-h" className="t-1 mt-6 text-ink" parts={[["One token.", ""], ["Official contracts only.", "text-ink-4"]]} />
            <Reveal delay={0.1}>
              <p className="mt-5 max-w-md text-lg text-ink-2">
                {live === null
                  ? `Built for ${mainnets.length} networks with native USDC, each opening after its own on-chain check.`
                  : liveNets.length > 0
                    ? `Live on ${liveNets.map((n) => n.name).join(" and ")}. ${soon} more networks with native USDC are coming soon, each opening after its own on-chain check.`
                    : `Built for ${mainnets.length} networks with native USDC, each opening after its own on-chain check. Coming soon.`}
              </p>
              <p className="mt-3 max-w-md text-[0.9375rem] text-ink-3">
                Each network&apos;s USDC address comes from Circle&apos;s published list and is probed on-chain before the network can be enabled. A look-alike token is recorded and ignored, never credited.
              </p>
              <Link href="/networks" className="mt-6 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                Read the network registry<ArrowRight className="size-4" aria-hidden />
              </Link>
            </Reveal>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {liveNets.map((n, i) => {
              const r = reading(n.id);
              return (
                <ClipReveal key={n.id} variant="polygon" delay={i * 0.12} className="h-full">
                  <Tilt className="h-full" max={4} lift={5}>
                    <Spotlight className="card h-full overflow-hidden p-6">
                      <div className="flex items-start justify-between gap-3">
                        <ChainIcon id={n.id} size={44} />
                        <Chip tone="ok" pulse>Live on mainnet</Chip>
                      </div>
                      <h3 className="mt-5 text-[1.375rem] font-medium tracking-[-0.03em] text-ink">{n.name}</h3>
                      <p className="mt-0.5 font-mono text-xs text-ink-3">chain {n.chainId}</p>
                      <dl className="mt-5 space-y-2.5 text-sm">
                        <div className="flex justify-between gap-3"><dt className="text-ink-3">USDC contract</dt><dd className="font-mono text-xs text-ink-2">{short(n.usdc.address)}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-ink-3">Final after</dt><dd className="text-ink-2">{n.finality.strategy === "finalized-tag" ? "finalized block" : `${n.finality.confirmations} confirmation${n.finality.confirmations === 1 ? "" : "s"}`}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-ink-3">Network fees in</dt><dd className="text-ink-2">{n.gas.model === "usdc-native" ? "USDC" : n.nativeCurrency.symbol}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-ink-3">Relayer</dt><dd className="text-ink-2">{r?.relayer ?? "unknown"}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-ink-3">Checkout</dt><dd className="text-ink-2">{[r?.wallet_checkout && "wallet", r?.address_checkout && "address"].filter(Boolean).join(" and ") || "unknown"}</dd></div>
                      </dl>
                    </Spotlight>
                  </Tilt>
                </ClipReveal>
              );
            })}
          </div>
        </div>

        <div className="mt-20 sm:mt-24">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-lg text-lg font-medium tracking-[-0.02em] text-ink">Every network where Circle issues USDC natively <span className="text-ink-4">is on the list.</span></p>
            <Link href="/networks" className="text-sm font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink">See each network</Link>
          </div>
          <div className="space-y-3">
            {rows.map((row, r) => (
              <Marquee key={r} seconds={r === 0 ? 70 : 84} reverse={r === 1}>
                {row.map((n) => (
                  <span key={n.id} className="inline-flex h-14 items-center gap-3 rounded-card border border-line bg-raised px-4 pr-4 shadow-low">
                    <ChainIcon id={n.id} size={30} />
                    <span className="whitespace-nowrap text-[0.9375rem] font-medium text-ink">{n.name}</span>
                    {live !== null && (liveIds.has(n.id) ? <Chip tone="ok" dot={false} className="h-5 px-2 text-2xs">Live</Chip> : <Chip dot={false} className="h-5 px-2 text-2xs">Soon</Chip>)}
                  </span>
                ))}
              </Marquee>
            ))}
          </div>
        </div>

        <div className="mt-20 sm:mt-24">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-md text-lg font-medium tracking-[-0.02em] text-ink">Pay from the wallet you already have. <span className="text-ink-4">One signature, and Plinth covers the network fee.</span></p>
            <p className="text-xs text-ink-3">Marks belong to their owners and show compatibility, not partnership.</p>
          </div>
          <Marquee seconds={38}>
            {WALLETS.map(([id, name]) => (
              <span key={id} className="inline-flex h-14 items-center gap-3 rounded-card border border-line bg-raised px-4 pr-5 shadow-low">
                <WalletIcon id={id} size={30} />
                <span className="whitespace-nowrap text-[0.9375rem] font-medium text-ink">{name}</span>
              </span>
            ))}
          </Marquee>
        </div>
      </div>
    </Band>
  );
}
