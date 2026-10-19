import { ArrowDown, ArrowRight, Eye, Fuel, KeyRound, Landmark, Radio, Server, Wallet } from "lucide-react";
import { ChainIcon, TokenIcon } from "@/components/brand";

function Zone({ tone, title, tag, children }: { tone: "plain" | "risk" | "key"; title: string; tag: string; children: React.ReactNode }) {
  const bg = tone === "key" ? "bg-signal-quiet" : tone === "risk" ? "bg-warn-quiet" : "bg-raised";
  const tagc = tone === "key" ? "text-signal-ink" : tone === "risk" ? "text-warn-ink" : "text-ink-3";
  return (
    <section aria-label={title} className={`rounded-panel border border-line ${bg} p-5 sm:p-6`}>
      <p className={`text-xs font-medium ${tagc}`}>{tag}</p>
      <h3 className="t-3 mt-1">{title}</h3>
      <ul className="mt-5 divide-y divide-black/[0.07]">{children}</ul>
    </section>
  );
}

function Row({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-3 py-3 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 size-[1.125rem] text-ink-2" aria-hidden />
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-2">{children}</p>
      </div>
    </li>
  );
}

function Join({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-xs font-medium text-ink-3 lg:flex-col lg:py-0">
      <ArrowDown className="size-4 lg:hidden" aria-hidden />
      <ArrowRight className="hidden size-4 lg:block" aria-hidden />
      <span className="lg:max-w-[5.5rem] lg:text-center">{label}</span>
    </div>
  );
}

/** The custody trust boundary, drawn with layout and icons only. */
export function TrustDiagram() {
  return (
    <figure>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.15fr)_auto_minmax(0,1fr)] lg:items-stretch lg:gap-3">
        <Zone tone="plain" title="Customer" tag="Holds their own keys">
          <Row icon={Wallet} title="Wallet">Signs one EIP-3009 authorization. Never approves a spender and needs no gas.</Row>
          <Row icon={Radio} title="Invoice address">Computed before it exists. It commits to the token, destination, fee rate, merchant, invoice and chain.</Row>
        </Zone>
        <Join label="USDC" />
        <Zone tone="risk" title="Plinth gateway" tag="Assumed compromisable">
          <Row icon={Eye} title="Watcher">Re-verifies every transfer from its receipt against the official token and finality rule.</Row>
          <Row icon={Fuel} title="Relayer">Pays gas and calls <code className="font-mono text-xs">sweep()</code>, which takes no arguments. Holds gas only, never merchant funds.</Row>
          <Row icon={Server} title="API and webhooks">Derives status, signs and retries events. Cannot move money.</Row>
        </Zone>
        <Join label="Sweep, minus fee" />
        <Zone tone="key" title="Merchant vault" tag="You hold the only key">
          <Row icon={Landmark} title="MerchantVault">Non-upgradeable. The owner is the only authority.</Row>
          <Row icon={KeyRound} title="Owner key">Withdraws anywhere. Forwarding rules change only after a delay you set.</Row>
        </Zone>
      </div>
      <figcaption className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-3">
        <span className="inline-flex items-center gap-2"><TokenIcon symbol="USDC" size={20} />Funds only ever move customer, invoice address, then your vault or payout wallet (and the fee to the treasury).</span>
        <span className="inline-flex items-center gap-2"><ChainIcon id="arc-mainnet" size={20} />Contract tests also run against the real USDC bytecode (read-only forks).</span>
      </figcaption>
    </figure>
  );
}
