"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Clock, Lock, Wallet, QrCode, ShieldCheck, Zap } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { formatCountdown } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Amount } from "@/components/amount";
import { CopyButton } from "@/components/copy-button";
import { LogoMark } from "@/components/brand";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { Notice } from "@/components/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletProvider } from "./wallet-provider";
import { WalletPanel } from "./wallet-panel";
import { AddressPanel } from "./address-panel";
import { ConfirmingPanel, ReceiptPanel, ClosedPanel } from "./checkout-states";
import { HelpPanel, HowItWorks, MerchantMark, Meter, NetworkSelector, StatusThread, TestBadge, useCountdown, utcClock, type Net, type PaymentRow } from "./checkout-parts";

const PAID = ["PAID", "OVERPAID", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"];
const CLOSED = ["EXPIRED", "UNDERPAID", "LATE_PAYMENT", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED", "CANCELED"];

export function CheckoutView({ id, initial }: { id: string; initial: any }) {
  const { data, error, refetch } = useQuery({
    queryKey: ["checkout", id],
    queryFn: () => apiFetch<any>(`/public/checkout/${id}`),
    initialData: initial,
    // Poll fast while funds are in flight; slowly while idle. Status comes only from the backend.
    refetchInterval: (q) => (q.state.data?.status === "SETTLED" ? false : 2000),
  });

  // Coming back from a wallet app: re-check immediately.
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [refetch]);

  const networks = data.networks as Net[];
  const sym: string = data.currency ?? "USDC";
  const left = useCountdown(data.seconds_remaining);
  const walletOn = data.checkout_methods.includes("WALLET");
  const addressOn = data.checkout_methods.includes("ADDRESS");
  const [tab, setTab] = useState<"wallet" | "address">(walletOn ? "wallet" : "address");
  const usable = (n: Net, t: "wallet" | "address") => (t === "wallet" ? n.wallet_checkout_supported : !!n.deposit_address);
  const [network, setNetwork] = useState<string>(() => (networks.find((n) => usable(n, tab)) ?? networks[0])?.network ?? "");
  // The chosen network must be valid for the chosen method; otherwise move to the first one that is.
  useEffect(() => {
    const cur = networks.find((n) => n.network === network);
    if (!cur || !usable(cur, tab)) {
      const next = networks.find((n) => usable(n, tab));
      if (next) setNetwork(next.network);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, networks]);
  const net = networks.find((n) => n.network === network);

  const status: string = data.status;
  const pending = BigInt(data.amount_pending_units);
  const final = BigInt(data.amount_received_units);
  const remainingUnits: string = data.remaining_units;
  const rem = BigInt(remainingUnits);
  const paid = PAID.includes(status);
  const inFlight = status === "DETECTED" || status === "CONFIRMING";
  const fullyCovered = inFlight && rem === 0n;
  const partial = !paid && final + pending > 0n && rem > 0n;
  const payments = data.payments as PaymentRow[];
  const wrongToken = payments.some((p) => !p.official_asset);
  const expiredNow = !paid && !fullyCovered && left === 0 && !CLOSED.includes(status);
  const closed = !paid && !fullyCovered && (CLOSED.includes(status) || expiredNow || (status === "INVALID_ASSET" && left === 0));
  const closedKind = CLOSED.includes(status) || status === "INVALID_ASSET" ? status : final + pending > 0n ? "UNDERPAID" : "EXPIRED";
  const testMode = !data.livemode || networks.some((n) => n.environment === "testnet");
  const view: "receipt" | "confirming" | "closed" | "pay" = paid ? "receipt" : fullyCovered ? "confirming" : closed ? "closed" : "pay";
  const receivedSoFar = (Number(final + pending) / 1e6).toFixed(2);
  const canTransact = view === "pay";

  const total = Math.max(1, (new Date(data.expires_at).getTime() - new Date(data.created_at).getTime()) / 1000);
  const urgent = left <= 60;
  const announce = view !== "pay" ? "" : left === 0 ? "This payment has expired." : left <= 60 ? "Less than one minute left to pay." : "";
  const stationsTotal = useMemo(() => ({ pct: (Number(final) / Number(BigInt(data.amount_units) || 1n)) * 100, pend: (Number(pending) / Number(BigInt(data.amount_units) || 1n)) * 100 }), [final, pending, data.amount_units]);

  return (
    <WalletProvider networks={networks}>
      <style>{`@media print{body *{visibility:hidden}#receipt,#receipt *{visibility:visible}#receipt{position:absolute;left:0;top:0;width:100%;padding:24px}}`}</style>
      <div className="relative isolate min-h-dvh bg-ground">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 [mask-image:linear-gradient(180deg,#000_55%,transparent)]"><ShaderField preset="mesh" colors={SHADER_COLORS["mesh-light"]!} spotlight={false} speed={0.5} className="opacity-90" /></div>
        <header className="mx-auto flex h-16 max-w-[70rem] items-center justify-between gap-3 px-5 sm:px-8">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm text-ink-3"><LogoMark size={20} />Secure checkout</span>
          <div className="flex items-center gap-3">
            {testMode && <TestBadge />}
            <a href="#help" onClick={() => (document.getElementById("help") as HTMLDetailsElement | null)?.setAttribute("open", "")} className="hidden text-sm font-medium text-ink-2 hover:text-ink sm:inline">Help</a>
          </div>
        </header>

        <main id="main" className="mx-auto grid max-w-[70rem] items-start gap-x-14 gap-y-5 px-5 pb-16 pt-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_30rem] lg:pt-8">
          {/* ── left: what is being paid, and how far along it is ───────────── */}
          <div className="contents lg:block lg:sticky lg:top-8 lg:self-start">
            <section aria-labelledby="summary" className="order-1">
              <div className="card overflow-hidden p-0">
                <div className="surface-ink relative isolate overflow-hidden px-6 pb-8 pt-6 sm:px-8">
                  <div aria-hidden className="absolute inset-0 -z-10"><ShaderField preset="mist" colors={SHADER_COLORS["mist-dark"]!} spotlight={false} speed={0.55} /></div>
                  <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(10_16_25/0.35),rgb(10_16_25/0.1))]" />
                  <div className="flex items-center gap-3">
                    <MerchantMark name={data.merchant_name || "?"} />
                    <div className="min-w-0">
                      <p className="text-xs text-white/60">Payment to</p>
                      <h1 id="summary" className="truncate text-xl font-medium tracking-[-0.02em] text-white">{data.merchant_name}</h1>
                    </div>
                  </div>
                  <div className="[--color-ink:#fff] [--color-ink-2:rgb(255_255_255/0.8)] [--color-ink-3:rgb(255_255_255/0.62)] [--color-ink-4:rgb(255_255_255/0.5)] [--color-sunk:rgb(255_255_255/0.14)] [--color-signal-quiet:rgb(14_166_107/0.25)]">
              <div className="mt-8">
                <p className="label">{view === "closed" ? (final + pending > 0n ? "Not received" : "Amount requested") : partial ? "Remaining to pay" : paid ? "Amount paid" : "Amount due"}</p>
                <Amount value={view === "closed" && partial ? data.remaining : partial ? data.remaining : paid ? data.amount_received : data.amount} size="display" symbol={sym} className="mt-2 block max-w-full text-[2.75rem] sm:text-[3.5rem]" />
                {partial && (
                  <div className="mt-3 max-w-xs">
                    <Meter label={`${receivedSoFar} of ${data.amount} ${sym} received`} parts={[{ pct: stationsTotal.pct, tone: "signal" }, { pct: stationsTotal.pend, tone: "info" }]} />
                    <p className="mt-2 text-sm text-ink-3" aria-live="polite">of <Amount value={data.amount} size="sm" symbol={sym} /> total · <span className="tnum">{receivedSoFar}</span> {sym} seen so far</p>
                  </div>
                )}
              </div>

                  </div>
                </div>
                <div className="px-6 pb-6 pt-5 sm:px-8">
              {data.description && <p className="max-w-md text-[0.9375rem] text-ink-2">{data.description}</p>}

              <dl className="mt-4 divide-y divide-line text-sm">
                {data.order_reference && (
                  <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-ink-3">Reference</dt><dd className="flex items-center gap-1 font-mono text-[0.8125rem] text-ink">{data.order_reference}<CopyButton value={data.order_reference} compact label="Copy reference" /></dd></div>
                )}
                <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-ink-3">Payment ID</dt><dd className="flex items-center gap-1 font-mono text-[0.8125rem] text-ink">{data.id.slice(0, 12)}…<CopyButton value={data.id} compact label="Copy payment ID" /></dd></div>
                <div className="py-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-ink-3">{canTransact || view === "confirming" ? "Expires in" : "Expiry"}</dt>
                    <dd>
                      {view === "receipt" ? (
                        <span className="text-ink-3">Not applicable</span>
                      ) : left === 0 ? (
                        <span className="text-ink-3">Expired</span>
                      ) : (
                        <span className={cn("tnum inline-flex items-center gap-1.5 font-medium transition-colors duration-[var(--duration-base)]", urgent ? "text-bad-ink" : "text-ink")}>
                          <Clock className="size-3.5" aria-hidden /> {formatCountdown(left)}
                          <span className="font-normal text-ink-3">at {utcClock(data.expires_at)}</span>
                        </span>
                      )}
                    </dd>
                  </div>
                  {view !== "receipt" && left > 0 && (
                    <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-sunk" aria-hidden>
                      <div className={cn("h-full origin-left rounded-full transition-[transform,background-color] duration-1000 ease-linear", urgent ? "bg-bad" : "bg-ink")} style={{ transform: `scaleX(${Math.min(1, left / total)})` }} />
                    </div>
                  )}
                </div>
              </dl>

                </div>
              </div>
              <p className="sr-only" role="status" aria-live="polite">{announce}</p>
            </section>

            <section aria-label="Progress" className="order-3 mt-1 lg:mt-9">
              <div className="card px-5 py-5">
                <StatusThread data={data} closed={view === "closed"} />
              </div>
              <p className="mt-5 hidden items-start gap-2 px-1 text-xs text-ink-3 lg:flex"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Non-custodial. Funds settle into a vault controlled only by the merchant. Plinth cannot move them.</p>
            </section>
          </div>

          {/* ── right: the payment card ─────────────────────────────────────── */}
          <section aria-label="Payment" className="order-2 grid gap-4 lg:row-span-1">
            <div className="card p-5 sm:p-6">
              {view === "receipt" && <ReceiptPanel data={data} />}
              {view === "confirming" && <ConfirmingPanel data={data} />}
              {view === "closed" && <ClosedPanel data={data} kind={closedKind} onRecheck={() => refetch()} />}
              {view === "pay" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3"><h2 className="text-[1.1875rem] font-medium tracking-[-0.025em] text-ink">Pay with {sym}</h2><span className="inline-flex items-center gap-1.5 text-xs text-ink-3"><Lock className="size-3" aria-hidden />Encrypted and non-custodial</span></div>
                  {inFlight && partial && (
                    <div role="status" className="flex items-start gap-2.5 rounded-ctl bg-info-quiet px-3.5 py-3 text-sm text-info-ink">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-info animate-[live-pulse_1.4s_ease-in-out_infinite]" aria-hidden />
                      <p><strong className="font-medium">Part of the payment is on its way.</strong> {receivedSoFar} {sym} seen so far. Send the remaining <span className="tnum font-medium">{data.remaining}</span> {sym} to complete it.</p>
                    </div>
                  )}
                  {partial && !inFlight && (
                    <div role="status" className="rounded-ctl bg-info-quiet px-3.5 py-3 text-sm text-info-ink">
                      <strong className="font-medium">Partly paid.</strong> <span className="tnum">{receivedSoFar}</span> {sym} is final. Send the remaining <span className="tnum font-medium">{data.remaining}</span> {sym} to complete it.
                    </div>
                  )}
                  {wrongToken && (
                    <div role="alert" className="flex gap-2.5 rounded-ctl border border-bad/25 bg-bad-quiet px-3.5 py-3 text-sm text-bad-ink">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <p><strong className="font-medium">A token that is not official {sym} was sent to this address.</strong> It is ignored and was not credited. You can still pay the full amount in official {sym} below. Keep that transaction hash and ask the merchant about it.</p>
                    </div>
                  )}

                  <NetworkSelector networks={networks} value={network} onChange={setNetwork} mode={tab} />

                  <Tabs value={tab} onValueChange={(v) => setTab(v as "wallet" | "address")}>
                    {walletOn && addressOn && (
                      <TabsList className="grid w-full grid-flow-col auto-cols-fr" aria-label="How to pay">
                        <TabsTrigger value="wallet" className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap px-2"><Wallet className="size-4 max-[400px]:hidden" aria-hidden />Pay with wallet</TabsTrigger>
                        <TabsTrigger value="address" className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap px-2"><QrCode className="size-4 max-[400px]:hidden" aria-hidden />Send to address</TabsTrigger>
                      </TabsList>
                    )}
                    {walletOn && (
                      <TabsContent value="wallet" className="pt-5 focus-visible:outline-none data-[state=active]:animate-[rise-in_var(--duration-base)_var(--ease-out)]">
                        <WalletPanel id={id} net={net} remaining={data.remaining} remainingUnits={remainingUnits} onUseAddress={() => setTab("address")} disabled={!canTransact} />
                      </TabsContent>
                    )}
                    {addressOn && (
                      <TabsContent value="address" className="pt-5 focus-visible:outline-none data-[state=active]:animate-[rise-in_var(--duration-base)_var(--ease-out)]">
                        <AddressPanel net={net} amount={data.amount} remaining={data.remaining} remainingUnits={remainingUnits} receivedSoFar={receivedSoFar} partial={partial} disabled={!canTransact} />
                      </TabsContent>
                    )}
                  </Tabs>
                </div>
              )}

              <div className="mt-6 -mb-3.5">
                <HowItWorks symbol={sym} />
                <HelpPanel data={data} />
              </div>
            </div>

            {view === "pay" && (
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-ink-3">
                <li className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-signal-ink" aria-hidden />Official {sym} only</li>
                <li className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden />Funds go to the merchant&apos;s vault</li>
                <li className="inline-flex items-center gap-1.5"><Zap className="size-3.5" aria-hidden />One signature, no gas on supported networks</li>
              </ul>
            )}
            {payments.length > 0 && view === "pay" && (
              <div className="card-flat px-5 py-4">
                <h2 className="label">Transfers seen for this payment</h2>
                <ul className="mt-1 divide-y divide-line">
                  {payments.map((p) => (
                    <li key={p.tx_hash + p.amount} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <Amount value={p.amount} size="sm" symbol={sym} />
                        {!p.official_asset && <span className="rounded-full bg-bad-quiet px-2 py-0.5 text-xs text-bad-ink">not {sym}, ignored</span>}
                      </span>
                      <span className="flex items-center gap-3 text-ink-3">
                        <span className="tnum text-xs">{p.status === "FINAL" ? "Final" : `${p.confirmations} conf.`}</span>
                        <a href={p.explorer_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-mono text-xs font-medium text-ink-2 hover:text-ink" aria-label="View transaction in explorer">
                          tx <ArrowUpRight className="size-3.5" aria-hidden />
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <Notice tone="bad"><span role="alert">Connection problem, retrying. {(error as Error).message}</span></Notice>}
            <p className="flex items-start gap-2 px-1 text-xs text-ink-3 lg:hidden"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Non-custodial. Funds settle into a vault controlled only by the merchant. Plinth cannot move them.</p>
          </section>
        </main>

        <footer className="mx-auto flex max-w-[70rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pb-10 text-xs text-ink-3 sm:px-8 print:hidden">
          <span className="inline-flex items-center gap-2"><LogoMark size={16} />Powered by Plinth</span>
          <nav aria-label="Plinth" className="flex gap-5">
            <Link href="/security" className="hover:text-ink">Security</Link>
            <Link href="/status" className="hover:text-ink">Status</Link>
          </nav>
        </footer>
      </div>
    </WalletProvider>
  );
}
