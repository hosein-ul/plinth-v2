"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { activeTokens, type TokenSymbol } from "@/lib/tokens";
import { TokenPicker } from "./token-picker";
import { Amount } from "@/components/amount";
import { Progress5, StatusBadge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, PageHeader, Section, Skeleton } from "@/components/page";
import { useDataSource, useHref } from "@/lib/data-source";
import { relativeTime } from "@/lib/format";
import { ActivationChecklist } from "./activation";
import { CreatePaymentDialog, StartPaymentAction } from "./create-payment";
import { PaymentCell, TableHeading } from "./parts-payments";

export function OverviewView() {
  const router = useRouter();
  const href = useHref();
  const { readOnly } = useDataSource();
  const nets = useApi<any>("/v1/networks");
  // Figures are in one token at a time: amounts of different tokens are never added together.
  const tokens = activeTokens(nets.data?.data ?? []);
  const [picked, setPicked] = useState<TokenSymbol>("USDC");
  const cur: TokenSymbol = tokens.includes(picked) ? picked : tokens[0] ?? "USDC";
  const o = useApi<any>(`/v1/overview?days=30${cur === "USDC" ? "" : `&currency=${cur}`}`);
  const recent = useApi<any>("/v1/payments?limit=6");
  const attention = useApi<any>("/v1/payments?limit=5&status=SETTLEMENT_FAILED,INVALID_ASSET,LATE_PAYMENT,UNDERPAID,REFUND_REQUESTED,OVERPAID");

  const hasVault = (nets.data?.data ?? []).some((n: any) => n.vault);
  const d = o.data;
  // A brand-new account has nothing to chart: say so once, instead of a grid of zeros.
  const noPayments = !!d && d.counts.total === 0 && !!recent.data && (recent.data.data ?? []).length === 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Received means final on-chain. Settled means delivered to your vault or wallet. They are shown separately on purpose."
        actions={hasVault ? <div className="flex flex-wrap items-center gap-3"><TokenPicker tokens={tokens} value={cur} onChange={setPicked} label="Showing" compact /><CreatePaymentDialog /></div> : undefined}
      />

      {!readOnly && <ActivationChecklist />}

      {noPayments ? (
        <EmptyState
          title="No payments yet"
          body="Once your first payment is created, this page shows what was received, what is still pending and what has settled into your vault, with a daily chart. Everything here comes from the chain, never from estimates."
          action={<StartPaymentAction />}
        />
      ) : (
      <>

      {o.error ? (
        <ErrorState error={o.error} retry={() => o.refetch()} />
      ) : (
        <section className="card overflow-hidden" aria-label="Key figures, last 30 days">
          <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2">
                <p className="label">You received</p>
                <span className="text-xs text-ink-4" aria-hidden>/</span>
                <p className="text-xs text-ink-3">Last 30 days</p>
              </div>
              <div className="mt-4">
                {d ? <Amount value={(d.net_settled ?? d.settled_to_vault).amount} size="display" symbol={cur} className="max-sm:text-[2.25rem]" /> : <Skeleton className="h-[3.25rem] w-72 max-w-full" />}
              </div>
              <p className="mt-3 max-w-sm text-sm text-ink-3">Delivered to your vault or wallet, after the platform fee.</p>
            </div>
            <dl className="divide-y divide-line border-t border-line bg-wash lg:border-l lg:border-t-0">
              <FigureRow symbol={cur} label="Received (final)" note="Final at deposit addresses or paid by wallet" value={d?.received_final.amount} />
              <FigureRow symbol={cur} label="Pending" note="Seen on-chain, not yet final" value={d?.pending.amount} />
              <FigureRow symbol={cur} label="Platform fee" note="Taken from settled payments" value={d?.platform_fees?.amount} />
              <FigureRow symbol={cur} label="Refunded" note="Returned to customers" value={d?.refunded.amount} />
            </dl>
          </div>
          <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            <Count label="Successful" value={d?.counts.successful} />
            <Count label="Pending" value={d?.counts.pending} />
            <Count label="Failed or expired" value={d?.counts.failed} />
            <Count label="Success rate" value={d ? (d.success_rate === null ? "—" : `${d.success_rate}%`) : undefined} title="Paid ÷ (paid + expired/failed). Open payments excluded." />
          </dl>
        </section>
      )}

      {!o.error && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Section title="Received per day" description="Final funds by payment creation date" className="mb-0">
            {d ? <DailyBars days={d.daily} /> : <Skeleton className="h-44 w-full" />}
          </Section>
          <Section title="By network" description="Final funds received" className="mb-0">
            {!d ? <Skeleton className="h-32 w-full" /> : d.network_distribution.length === 0 ? (
              <p className="text-sm text-ink-3">No final payments yet.</p>
            ) : (
              <ul className="space-y-4">
                {(() => {
                  const max = Math.max(...d.network_distribution.map((n: any) => Number(n.units)), 1);
                  return d.network_distribution.map((n: any) => (
                    <li key={n.network}>
                      <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-ink">{n.name}</span><Amount value={n.amount} size="sm" unit={false} symbol={cur} /></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full bg-ink transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]" style={{ width: `${Math.max(2, (Number(n.units) / max) * 100)}%` }} /></div>
                    </li>
                  ));
                })()}
              </ul>
            )}
          </Section>
        </div>
      )}

      {(attention.data?.data?.length ?? 0) > 0 && (
        <section className="mt-10" aria-label="Needs attention">
          <TableHeading title="Needs attention" description="Payments in a state that may need a decision" />
          <DataTable
            caption="Payments needing attention" loading={attention.isLoading} rows={attention.data?.data} rowKey={(r: any) => r.id}
            onRowClick={(r: any) => router.push(href(`/dashboard/payments/${r.id}`))}
            columns={[
              { key: "ref", header: "Payment", cell: (r: any) => <PaymentCell title={r.order_reference ?? r.description ?? "Payment"} id={r.id} /> },
              { key: "status", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
              { key: "amt", header: "Amount", align: "right", cell: (r: any) => <Amount value={r.amount} size="sm" symbol={r.currency ?? "USDC"} /> },
            ]}
          />
        </section>
      )}

      <section className="mt-10" aria-label="Recent payments">
        <TableHeading
          title="Recent payments"
          actions={
            <Link href={href("/dashboard/payments")} className="inline-flex items-center gap-1 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink">
              View all<ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        {recent.error ? (
          <ErrorState error={recent.error} retry={() => recent.refetch()} />
        ) : (
          <DataTable
            caption="Recent payments" loading={recent.isLoading} rows={recent.data?.data} rowKey={(r: any) => r.id}
            onRowClick={(r: any) => router.push(href(`/dashboard/payments/${r.id}`))}
            empty={<EmptyState title="No payments yet" body="Create a payment and pay it from your wallet to see the full lifecycle here." action={<StartPaymentAction />} />}
            columns={[
              { key: "ref", header: "Payment", cell: (r: any) => <PaymentCell title={r.order_reference ?? r.description ?? "—"} id={r.id} /> },
              { key: "status", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
              { key: "prog", header: "Progress", hideBelow: "md", cell: (r: any) => <Progress5 status={r.status} /> },
              { key: "when", header: "Created", hideBelow: "sm", cell: (r: any) => <span className="text-ink-3">{relativeTime(r.created_at)}</span> },
              { key: "amt", header: "Amount", align: "right", cell: (r: any) => <Amount value={r.amount} size="sm" symbol={r.currency ?? "USDC"} /> },
            ]}
          />
        )}
      </section>
      </>
      )}
    </>
  );
}

/** Secondary figure: label and note on the left, amount on the right. */
function FigureRow({ label, note, value, symbol }: { label: string; note: string; value: string | undefined; symbol: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-5 sm:px-7">
      <div className="min-w-0">
        <dt className="text-sm font-medium text-ink">{label}</dt>
        <p className="mt-0.5 text-xs text-ink-3">{note}</p>
      </div>
      <dd className="shrink-0">{value !== undefined ? <Amount value={value} size="lg" symbol={symbol} /> : <Skeleton className="h-6 w-28" />}</dd>
    </div>
  );
}

function Count({ label, value, title }: { label: string; value: string | number | undefined; title?: string }) {
  return (
    <div className="bg-raised px-6 py-4 sm:px-7" title={title}>
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-xl font-medium tracking-[-0.02em] tnum text-ink">{value !== undefined ? value : <Skeleton className="mt-2 h-5 w-10" />}</dd>
    </div>
  );
}

/** Bars drawn from real daily totals over a continuous window (min. 14 days) so one busy day is not a wall. */
function DailyBars({ days }: { days: { day: string; received_final_units: string; payments: number }[] }) {
  if (days.length === 0) return <p className="text-sm text-ink-3">No payments in this period.</p>;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const last = new Date(`${days[days.length - 1]!.day}T00:00:00Z`);
  const first = new Date(`${days[0]!.day}T00:00:00Z`);
  const span = Math.max(14, Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1);
  const series = Array.from({ length: span }, (_, i) => {
    const d = new Date(last.getTime() - (span - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return byDay.get(d) ?? { day: d, received_final_units: "0", payments: 0 };
  });
  const max = Math.max(...series.map((d) => Number(d.received_final_units)), 1);
  const w = 100 / series.length;
  return (
    <figure>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label={`Final funds received per day over ${series.length} days`}>
        <line x1="0" x2="100" y1="21.75" y2="21.75" stroke="var(--color-line)" strokeWidth="0.4" strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2="100" y1="43.5" y2="43.5" stroke="var(--color-line-strong)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        {series.map((d, i) => {
          const h = (Number(d.received_final_units) / max) * 40;
          return <rect key={d.day} x={i * w + w * 0.2} width={w * 0.6} y={43.5 - Math.max(h, 0.5)} height={Math.max(h, 0.5)} fill={h > 0 ? "var(--color-ink)" : "var(--color-line-strong)"}><title>{`${d.day}: ${d.payments} payment(s)`}</title></rect>;
        })}
      </svg>
      <figcaption className="mt-2 flex justify-between font-mono text-2xs text-ink-3"><span>{series[0]!.day}</span><span>{series[series.length - 1]!.day}</span></figcaption>
    </figure>
  );
}
