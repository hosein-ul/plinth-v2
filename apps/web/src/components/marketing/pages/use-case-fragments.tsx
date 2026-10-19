import { Link2 } from "lucide-react";
import { Amount } from "@/components/amount";
import { Chip, Progress5, StatusBadge } from "@/components/badge";
import { Hash } from "@/components/hash";

/** Frame for an illustrative product fragment built from the real dashboard and checkout components. */
export function Fragment({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="card overflow-hidden">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-wash px-5 py-2.5 text-xs font-medium text-ink-3">
        <span>{title}</span>
        <span>Sample data</span>
      </figcaption>
      {children}
    </figure>
  );
}

/** Online store: one payment from checkout to the vault, with the webhook that releases the order. */
export function StoreFragment() {
  return (
    <Fragment title="Payment detail">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-3">order_reference</p>
            <p className="font-mono text-sm text-ink">order-1042</p>
          </div>
          <StatusBadge status="SETTLED" />
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <Amount value="25.00" size="xl" />
          <Progress5 status="SETTLED" />
        </div>
      </div>
      <dl className="divide-y divide-line border-t border-line text-sm">
        <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6"><dt className="text-ink-3">Paid on</dt><dd className="text-ink">Arc</dd></div>
        <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6"><dt className="text-ink-3">Deposit address</dt><dd><Hash value="0x7Ac3d51B0e2F9b64A81c0D3f5E27b9A4c6D81e02" /></dd></div>
        <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-6"><dt className="text-ink-3">Webhook sent</dt><dd className="font-mono text-xs text-ink">payment.confirmed</dd></div>
      </dl>
    </Fragment>
  );
}

/** SaaS: one payment intent per billing period, created by the merchant's own scheduler. */
export function SaasFragment() {
  const rows: [string, string, string][] = [
    ["sub_204-2026-08", "49.00", "SETTLED"],
    ["sub_204-2026-09", "49.00", "SETTLED"],
    ["sub_204-2026-10", "49.00", "AWAITING_PAYMENT"],
  ];
  return (
    <Fragment title="Payments for one customer">
      <ul className="divide-y divide-line">
        {rows.map(([ref, amt, st]) => (
          <li key={ref} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:px-6">
            <span className="truncate font-mono text-sm text-ink">{ref}</span>
            <Amount value={amt} size="sm" className="sm:order-2" />
            <span className="sm:order-3"><StatusBadge status={st} /></span>
            <Progress5 status={st} className="sm:order-4" />
          </li>
        ))}
      </ul>
      <p className="border-t border-line bg-wash px-5 py-3 text-xs text-ink-3 sm:px-6">Each period is a separate payment intent that your own scheduler creates, with its own checkout link.</p>
    </Fragment>
  );
}

/** Freelancers and marketplaces: a numbered invoice with line items. */
export function InvoiceFragment() {
  const lines: [string, string, string][] = [
    ["Brand identity, phase one", "1", "1,200.00"],
    ["Revision rounds", "2", "150.00"],
  ];
  return (
    <Fragment title="Invoice">
      <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="text-sm text-ink-3">Billed to</p>
          <p className="font-medium text-ink">Customer name</p>
          <p className="text-sm text-ink-3">name@email.com</p>
        </div>
        <Chip tone="info">Awaiting payment</Chip>
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Invoice line items</caption>
        <thead>
          <tr className="border-y border-line bg-wash text-xs text-ink-3">
            <th scope="col" className="px-5 py-2 font-medium sm:pl-6">Description</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
            <th scope="col" className="px-5 py-2 text-right font-medium sm:pr-6">Unit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map(([d, q, u]) => (
            <tr key={d}>
              <td className="px-5 py-3 text-ink sm:pl-6">{d}</td>
              <td className="tnum px-2 py-3 text-right text-ink-2">{q}</td>
              <td className="px-5 py-3 text-right sm:pr-6"><Amount value={u} size="sm" unit={false} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-end justify-between gap-4 border-t border-line px-5 py-4 sm:px-6">
        <span className="text-sm text-ink-3">Total, due in 14 days</span>
        <Amount value="1500.00" size="lg" />
      </div>
    </Fragment>
  );
}

/** Platforms and agencies: team roles and a webhook delivery log. */
export function PlatformFragment() {
  const roles: [string, string][] = [["Owner", "Everything; only role that can add owners"], ["Admin", "Wallets, team, settings, payments, developer tools"], ["Developer", "Payments, API keys, webhooks"], ["Viewer", "Read only"]];
  const deliveries: [string, string, string][] = [["payment.confirmed", "200", "ok"], ["payment.completed", "200", "ok"], ["settlement.failed", "503, retry scheduled", "warn"]];
  return (
    <Fragment title="Team and webhook log">
      <ul className="divide-y divide-line">
        {roles.map(([r, d]) => (
          <li key={r} className="flex items-center justify-between gap-4 px-5 py-3 text-sm sm:px-6"><span className="font-medium text-ink">{r}</span><span className="text-right text-ink-3">{d}</span></li>
        ))}
      </ul>
      <ul className="divide-y divide-line border-t border-line bg-wash">
        {deliveries.map(([e, r, t]) => (
          <li key={e} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
            <code className="font-mono text-xs text-ink">{e}</code>
            <Chip tone={t as "ok" | "warn"}>{r}</Chip>
          </li>
        ))}
      </ul>
    </Fragment>
  );
}

/** Donations and tips: a fixed-amount payment link. */
export function LinkFragment() {
  return (
    <Fragment title="Payment link">
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-ctl bg-sunk text-ink-2"><Link2 className="size-5" aria-hidden /></span>
          <div>
            <p className="font-medium text-ink">Support the studio</p>
            <p className="text-sm text-ink-3">Fixed amount, reusable</p>
          </div>
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <Amount value="5.00" size="xl" />
          <span className="inline-flex h-11 items-center rounded-ctl bg-ink px-4 text-[0.9375rem] font-medium text-on-ink shadow-btn">Pay 5.00 USDC</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-wash px-5 py-3 sm:px-6">
        <code className="min-w-0 truncate font-mono text-xs text-ink-2">/l/support-the-studio</code>
        <span className="text-xs text-ink-3">Opening it creates a fresh payment</span>
      </div>
    </Fragment>
  );
}
