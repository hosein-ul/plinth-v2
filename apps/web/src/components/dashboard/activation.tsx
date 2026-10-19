"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Lock } from "lucide-react";
import { Skeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useHref } from "@/lib/data-source";
import { useApi } from "@/lib/hooks";
import { DEMO_HREF } from "@/lib/routes";
import { CreatePaymentDialog } from "./create-payment";

/**
 * Activation checklist for the real dashboard.
 *
 * Nothing here is stored in the browser: every step is derived from what the API says exists for this
 * merchant (vaults, payments, keys, webhook endpoints), so progress survives sign-outs and devices and
 * can never claim something that did not happen. The last step, going live, is informational only: it
 * lists what the network gate and the account still lack and never turns mainnet on.
 */

interface Step {
  key: string;
  title: string;
  body: string;
  done: boolean;
  /** Chain-confirmed facts get the mint check; everything else an ink check. */
  confirmed?: boolean;
  action?: React.ReactNode;
}

export function ActivationChecklist() {
  const href = useHref();
  const me = useApi<any>("/v1/me");
  const nets = useApi<any>("/v1/networks");
  const anyPayment = useApi<any>("/v1/payments?limit=1");
  const settled = useApi<any>("/v1/payments?limit=1&status=SETTLED");
  const keys = useApi<any>("/v1/api-keys");
  const hooks = useApi<any>("/v1/webhook-endpoints");

  const queries = [me, nets, anyPayment, settled, keys, hooks];
  if (queries.some((q) => q.error)) return null; // the page's own sections already report errors
  if (queries.some((q) => q.isLoading || !q.data)) return <Skeleton className="h-72 w-full rounded-card" />;
  if (me.data.environment === "live") return null; // the checklist is about getting ready on testnets

  const list: any[] = nets.data.data ?? [];
  const hasVaultRequest = list.some((n) => n.vault);
  const vaultActive = list.some((n) => n.vault?.status === "ACTIVE");
  const vaultFailed = hasVaultRequest && !vaultActive && list.every((n) => !n.vault || n.vault.status === "FAILED");
  const paymentMade = (anyPayment.data.data ?? []).length > 0;
  const paymentSettled = (settled.data.data ?? []).length > 0;
  const keyMade = (keys.data.data ?? []).some((k: any) => !k.revoked_at);
  const hookMade = (hooks.data.data ?? []).some((w: any) => w.status === "ACTIVE");

  const steps: Step[] = [
    {
      key: "network", title: "Choose a network", done: hasVaultRequest,
      body: "Pick a network and the address that will own your vault. Only that address can ever withdraw.",
      action: <Button variant="primary" asChild><Link href={href("/dashboard/networks")}>Choose a network <ArrowRight className="size-4" aria-hidden /></Link></Button>,
    },
    {
      key: "vault", title: "Vault is deployed", done: vaultActive, confirmed: true,
      body: vaultFailed ? "The last vault deployment failed. Open Networks to see why and try again." : hasVaultRequest ? "Your vault is being deployed on-chain. This page updates when it is confirmed." : "Created for you once you pick a network. It is a contract only your owner address controls.",
    },
    {
      key: "payment", title: "Create a test payment", done: paymentMade,
      body: "You get a checkout page link and a deposit address per network. The 0.20% platform fee is taken in the settlement transaction.",
      action: vaultActive ? <CreatePaymentDialog /> : undefined,
    },
    {
      key: "settled", title: "Watch it settle", done: paymentSettled, confirmed: true,
      body: "Open the checkout, pay a small amount, and follow the payment from detected to in your vault.",
      action: paymentMade ? <Button asChild><Link href={href("/dashboard/payments")}>Open payments</Link></Button> : undefined,
    },
    {
      key: "key", title: "Create an API key", done: keyMade,
      body: "Create payments from your own server. The full key is shown once.",
      action: <Button asChild><Link href={href("/dashboard/developers/api-keys")}>Create a key</Link></Button>,
    },
    {
      key: "hook", title: "Add a webhook endpoint", done: hookMade,
      body: "Get a signed request when a payment is confirmed or settled, so your server can fulfil orders.",
      action: <Button asChild><Link href={href("/dashboard/developers/webhooks")}>Add an endpoint</Link></Button>,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const currentKey = steps.find((s) => !s.done)?.key;

  const blockers = goLiveBlockers(list, steps);

  if (allDone) {
    if (blockers.network.length === 0 && !blockers.unlisted) return null;
    return (
      <section className="card mb-6 overflow-hidden" aria-label="Going live">
        <div className="p-5 sm:p-6">
          <GoLive blockers={blockers} ready />
        </div>
      </section>
    );
  }

  return (
    <section className="card dotgrid mb-6 overflow-hidden [--dot-x:92%] [--dot-y:20%]" aria-label="Get started">
      <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)]">
        <div>
          <p className="label">Setup · {doneCount} of {steps.length} done</p>
          <h2 className="t-2 mt-2 text-ink">{doneCount === 0 ? "Accept your first test payment." : "Keep going. You are close."}</h2>
          <p className="mt-2 max-w-sm text-[0.9375rem] text-ink-3">Each step turns on by itself when the backend sees it happen.</p>
          <div className="mt-5 h-1.5 max-w-xs overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Setup progress">
            <div className="h-full rounded-full bg-ink transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <Link href={DEMO_HREF} className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink">
            View the demo with sample data<ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        <ol className="divide-y divide-line">
          {steps.map((s, i) => {
            const current = s.key === currentKey;
            return (
              <li key={s.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 py-4 first:pt-0" aria-current={current ? "step" : undefined}>
                <StepMark n={i + 1} done={s.done} confirmed={s.confirmed} current={current} />
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", s.done ? "text-ink-3" : "text-ink")}>{s.title}</p>
                  {!s.done && <p className="mt-0.5 text-sm text-ink-3">{s.body}</p>}
                  {current && s.action && <div className="mt-3">{s.action}</div>}
                </div>
              </li>
            );
          })}
          <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 pt-4">
            <span aria-hidden className="grid size-6 place-items-center rounded-full bg-sunk text-ink-3"><Lock className="size-3" /></span>
            <div className="min-w-0"><GoLive blockers={blockers} /></div>
          </li>
        </ol>
      </div>
    </section>
  );
}

function StepMark({ n, done, confirmed, current }: { n: number; done: boolean; confirmed?: boolean; current: boolean }) {
  if (done) return <span aria-label="Done" className={cn("grid size-6 place-items-center rounded-full text-on-ink", confirmed ? "bg-signal" : "bg-ink")}><Check className="size-3.5" strokeWidth={3} aria-hidden /></span>;
  return <span aria-hidden className={cn("grid size-6 place-items-center rounded-full text-xs font-medium tnum", current ? "bg-ink text-on-ink" : "bg-sunk text-ink-2")}>{n}</span>;
}

interface Blockers {
  /** Per-reason lists from the network gate, with the networks each applies to. */
  network: { reason: string; networks: string[] }[];
  /** True when the API lists no mainnet network at all. */
  unlisted: boolean;
  /** Setup steps still open. */
  open: string[];
}

function goLiveBlockers(nets: any[], steps: Step[]): Blockers {
  const mainnets = nets.filter((n) => n.environment === "mainnet");
  const byReason = new Map<string, string[]>();
  for (const n of mainnets) {
    if (n.operational) continue;
    for (const r of (n.not_operational_reasons ?? []) as string[]) byReason.set(r, [...(byReason.get(r) ?? []), n.name]);
  }
  return {
    network: [...byReason].map(([reason, networks]) => ({ reason, networks })),
    unlisted: mainnets.length === 0,
    open: steps.filter((s) => !s.done).map((s) => s.title),
  };
}

/** The final step. Informational: mainnet is switched on by the operator after review, never from here. */
function GoLive({ blockers, ready }: { blockers: Blockers; ready?: boolean }) {
  const shown = blockers.network.slice(0, 6);
  return (
    <div>
      <p className="text-sm font-medium text-ink-2">{ready ? "Setup complete. Mainnet is the last step." : "Go live on mainnet"}</p>
      <p className="mt-0.5 text-sm text-ink-3">
        Real funds are enabled by the Plinth operator after review. This dashboard cannot turn mainnet on, and nothing you do here moves real money.
      </p>
      {(blockers.open.length > 0 || blockers.network.length > 0 || blockers.unlisted) && (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-2">Blocking mainnet right now</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-3">
            {blockers.open.map((t) => <li key={t} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />Not done yet: {t.toLowerCase()}</li>)}
            {shown.map((b) => (
              <li key={b.reason} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />
                <span>{b.reason} <span className="text-ink-4">· {b.networks.join(", ")}</span></span>
              </li>
            ))}
            {blockers.network.length > shown.length && <li className="pl-3 text-ink-4">and {blockers.network.length - shown.length} more</li>}
            {blockers.unlisted && <li className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />No mainnet network is configured on this deployment.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
