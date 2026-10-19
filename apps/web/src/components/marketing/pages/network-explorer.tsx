"use client";

import { useState } from "react";
import { Check, ExternalLink, Minus } from "lucide-react";
import { Chip } from "@/components/badge";
import { CopyButton } from "@/components/copy-button";
import { AssetOnChain, ChainIcon } from "@/components/brand";
import { TableCard, td } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

/** Plain, serialisable network facts (the registry itself holds bigint values that cannot cross to the client). */
export interface NetDTO {
  id: string;
  name: string;
  chainId: number;
  environment: "testnet" | "mainnet";
  nativeSymbol: string;
  usdc: string;
  /** Further official tokens the network lists (EURC on Arc). */
  extra: { symbol: string; address: string }[];
  explorer: string;
  finality: string;
  finalityNote: string;
  gas: string;
  verified: boolean;
  verifiedAt: string | null;
  cctp: number | null;
  rpcConfigured: boolean;
  /** True when the running API reports the network open for payments; null when the API could not be read. */
  live: boolean | null;
}

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

function Cap({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-1.5 text-sm">
      {on ? <Check className="mt-0.5 size-4 text-signal" strokeWidth={2.5} aria-label="Yes" /> : <Minus className="mt-0.5 size-4 text-ink-4" aria-label="No" />}
      <span className={on ? "text-ink-2" : "text-ink-3"}>{children}</span>
    </li>
  );
}

function NetCard({ n }: { n: NetDTO }) {
  return (
    <article className="card flex flex-col p-5 sm:p-6" aria-labelledby={`net-${n.id}`}>
      <header className="flex items-start gap-3">
        <ChainIcon id={n.id} size={36} />
        <div className="min-w-0 flex-1">
          <h3 id={`net-${n.id}`} className="t-3">{n.name}</h3>
          <p className="tnum text-xs text-ink-3">Chain ID {n.chainId}</p>
        </div>
        {n.live === true ? <Chip tone="ok">Live</Chip> : <Chip>Soon</Chip>}
      </header>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-ctl bg-wash px-3 py-2.5">
        <span className="flex items-center gap-2.5"><AssetOnChain symbol="USDC" id={n.id} size={28} /><span className="text-sm font-medium text-ink">USDC</span></span>
        <span className="flex min-w-0 items-center gap-1">
          <code className="truncate font-mono text-xs text-ink-2" title={n.usdc}>{short(n.usdc)}</code>
          <CopyButton compact value={n.usdc} label="Copy USDC address" />
          <a href={`${n.explorer}/address/${n.usdc}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${n.name} USDC in the block explorer`} className="grid size-6 place-items-center rounded-md text-ink-4 hover:bg-sunk hover:text-ink">
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </span>
      </div>
      {n.extra.map((t) => (
        <div key={t.symbol} className="mt-2 flex items-center justify-between gap-3 rounded-ctl bg-wash px-3 py-2.5">
          <span className="flex items-center gap-2.5"><AssetOnChain symbol={t.symbol as never} id={n.id} size={28} /><span className="text-sm font-medium text-ink">{t.symbol}</span></span>
          <span className="flex min-w-0 items-center gap-1">
            <code className="truncate font-mono text-xs text-ink-2" title={t.address}>{short(t.address)}</code>
            <CopyButton compact value={t.address} label={`Copy ${t.symbol} address`} />
            <a href={`${n.explorer}/address/${t.address}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${n.name} ${t.symbol} in the block explorer`} className="grid size-6 place-items-center rounded-md text-ink-4 hover:bg-sunk hover:text-ink">
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </span>
        </div>
      ))}

      <dl className="mt-5 divide-y divide-line text-sm">
        <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5 first:pt-0"><dt className="text-ink-3">Finality</dt><dd className="text-ink">{n.finality}<span className="block text-xs text-ink-3">{n.finalityNote}</span></dd></div>
        <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5"><dt className="text-ink-3">Gas</dt><dd className="text-ink">{n.gas}</dd></div>
        <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5 last:pb-0"><dt className="text-ink-3">Token probe</dt><dd className="text-ink">{n.verified ? `Verified ${n.verifiedAt}` : "Not verified yet"}</dd></div>
      </dl>

      <ul className="mt-5 space-y-2 border-t border-line pt-4">
        <Cap on={n.verified}>Gasless wallet payment (EIP-3009)</Cap>
        <Cap on={n.verified}>Unique deposit address per payment</Cap>
        <Cap on={false}>{n.cctp !== null ? `CCTP domain ${n.cctp} recorded; transfers not built` : "No CCTP domain recorded"}</Cap>
      </ul>

      <p className="mt-auto pt-5 text-xs text-ink-3">
        {n.live === true ? "Open for payments now." : "Opens once its Plinth contracts are deployed and byte-verified."}
      </p>
    </article>
  );
}

function Group({ title, note, nets }: { title: string; note: string; nets: NetDTO[] }) {
  if (nets.length === 0) return null;
  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="t-2">{title}</h2>
        <p className="text-sm text-ink-3">{note}</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{nets.map((n) => <NetCard key={n.id} n={n} />)}</div>
    </section>
  );
}

export function NetworkExplorer({ nets }: { nets: NetDTO[] }) {
  const [view, setView] = useState<"cards" | "registry">("cards");
  const tabs = [["cards", "Cards"], ["registry", "Registry table"]] as const;
  return (
    <div>
      <div role="group" aria-label="View" className="inline-flex rounded-ctl bg-sunk p-1">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={view === k}
            onClick={() => setView(k)}
            className={cn("h-8 rounded-[8px] px-3.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-snap)]", view === k ? "bg-raised text-ink shadow-ctl" : "text-ink-3 hover:text-ink")}
          >
            {l}
          </button>
        ))}
      </div>

      {view === "cards" ? (
        <div className="mt-10 space-y-16">
                    <Group title="Live" note="Open for payments now" nets={nets.filter((n) => n.live === true)} />
          <Group title="Soon" note="Tokens probed on-chain; opens after deployment" nets={nets.filter((n) => n.live !== true)} />
        </div>
      ) : (
        <div className="mt-10">
          <TableCard caption="Network registry" minWidth="58rem" head={["Network", "Chain ID", "Official tokens", "Token probe", "Finality", "Gas", "CCTP", "Status"]}>
            {nets.map((n) => (
              <tr key={n.id} className="transition-colors hover:bg-wash">
                <th scope="row" className={cn(td, "text-left font-medium text-ink")}>
                  <span className="flex items-center gap-2.5 whitespace-nowrap"><ChainIcon id={n.id} size={24} />{n.name}</span>
                  
                </th>
                <td className={cn(td, "tnum font-mono text-xs text-ink-2")}>{n.chainId}</td>
                <td className={cn(td, "break-all font-mono text-xs text-ink-2")}><span className="block">USDC {n.usdc}</span>{n.extra.map((t) => <span key={t.symbol} className="mt-1 block">{t.symbol} {t.address}</span>)}</td>
                <td className={td}>{n.verified ? <Chip tone="ok">verified {n.verifiedAt}</Chip> : <Chip>not verified</Chip>}</td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{n.finality}</td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{n.gas}</td>
                <td className={cn(td, "font-mono text-xs text-ink-2")}>{n.cctp ?? "—"}</td>
                <td className={td}>{n.live === true ? <Chip tone="ok">Live</Chip> : <Chip>Soon</Chip>}</td>
              </tr>
            ))}
          </TableCard>
        </div>
      )}
    </div>
  );
}
