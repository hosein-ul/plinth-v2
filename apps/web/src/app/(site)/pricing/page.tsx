import { ArrowDown, ArrowRight } from "lucide-react";
import { TokenIcon } from "@/components/brand";
import { PageIntro } from "@/components/marketing/chrome";
import { TableCard, td, wrap } from "@/components/marketing/parts";
import { AvailChip, CtaBand, JsonLd, Section, type Availability } from "@/components/marketing/pages/pages-kit";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Pricing",
  description: "Plinth takes 0.20% of each payment, inside the settlement transaction, capped by the contract at 1%. What else costs something, who pays it and how a payment settles.",
  path: "/pricing",
});

const ROWS: { name: string; how: string; state: Availability; today: string }[] = [
  { name: "Platform fee", how: "0.20% of each payment, rounded down to the token's smallest unit. It is taken in the same transaction that settles the payment and goes to the Plinth treasury address, so the rest reaches you directly. The contract caps any fee at 1%, and that cap cannot be changed after deployment.", state: "available", today: "Active: 0.20% on every payment" },
  { name: "A rate set for your account", how: "The operator can set a different rate for a merchant. Whatever the rate, it is written into each payment address when the address is issued and can never exceed the contract's 1% cap.", state: "available", today: "Default 0.20%; the dashboard shows your rate per network" },
  { name: "If the fee cannot be sent", how: "If the treasury transfer fails, the whole amount goes to you, the fee is not charged for that payment, and a FeeSkipped event records it. A failing treasury can never block a settlement.", state: "available", today: "Active" },
  { name: "Refunds", how: "The fee is not refunded. A refund can return at most the net amount you received, and you send it yourself from the account that received the funds.", state: "available", today: "Active" },
  { name: "Network fee", how: "The relayer pays the real network fee for deployments and sweeps. Its cost is recorded per operation in the ledger (in USDC on Arc), so it can later be passed through or absorbed.", state: "in-progress", today: "Recorded, not billed" },
  { name: "Dust protection", how: "Deposits below a per-network minimum are not swept automatically unless the invoice is satisfied, so tiny transfers cannot burn gas.", state: "available", today: "Active" },
  { name: "Cross-chain consolidation", how: "Optional CCTP transfers would carry their own protocol fees and a separate lifecycle.", state: "planned", today: "Not built" },
];

const WHO: [string, string][] = [
  ["Your customer", "Pays the amount on the invoice. With wallet checkout they pay no gas; the relayer submits the signed authorization. With the address flow they pay their own transfer gas."],
  ["You, the merchant", "Receive the amount minus the platform fee, in your vault or in your own payout wallet, whichever you chose. You pay gas yourself only when you move funds out of the vault or change its policy."],
  ["The gateway", "Pays gas for deployments and sweeps and records the cost, and receives the platform fee from the settlement transaction. It never holds your funds."],
];

const FLOW: { title: string; body: string; note: string }[] = [
  { title: "Customer pays", body: "The token leaves the customer's wallet for the unique invoice address.", note: "Customer: transfer gas, or none with wallet checkout" },
  { title: "Gateway verifies", body: "The watcher re-reads the receipt, checks the official token and waits for finality.", note: "No custody" },
  { title: "Relayer sweeps", body: "One transaction deploys the invoice contract if needed and splits the balance: the fee to the treasury, the rest to you.", note: "Network fee: paid by the relayer, recorded" },
  { title: "You receive", body: "The net amount is in the vault or payout wallet you chose. The dashboard shows received, fee and net separately.", note: "Platform fee: 0.20%, taken in that transaction" },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Plinth pricing", description: "The Plinth platform fee is 0.20% of each payment, capped by the contract at 1%." }} />
      <PageIntro eyebrow="Pricing" title="0.20% of each payment, taken by the contract">
        Plinth takes 0.20% of each payment inside the settlement transaction, and the contract refuses any fee above 1%. Arc is live today. This page explains what is charged, what already costs something and who pays it.
      </PageIntro>
      <div className={cn(wrap, "space-y-24 py-14")}>
        <Section id="who-pays" title="Who pays what today" lead="The split below is how costs work and are recorded.">
          <dl className="grid divide-y divide-line border-y border-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {WHO.map(([k, v]) => (
              <div key={k} className="py-6 lg:px-8 lg:py-8 lg:first:pl-0 lg:last:pr-0">
                <dt className="t-3">{k}</dt>
                <dd className="mt-2 text-[0.9375rem] text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="components" title="What is charged">
          <TableCard caption="Fees and costs" minWidth="48rem" head={["Component", "How it is applied", "Status", "Today"]}>
            {ROWS.map((r) => (
              <tr key={r.name} className="transition-colors hover:bg-wash">
                <th scope="row" className={cn(td, "w-52 text-left font-medium text-ink")}>{r.name}</th>
                <td className={cn(td, "text-ink-2")}>{r.how}</td>
                <td className={cn(td, "whitespace-nowrap")}><AvailChip state={r.state} /></td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{r.today}</td>
              </tr>
            ))}
          </TableCard>
        </Section>

        <Section id="settle" title="How a payment settles" lead="Where each cost arises along one payment. Example: a 100.00 payment settles as 99.80 to you and 0.20 to the treasury.">
          <ol className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
            {FLOW.flatMap((s, i) => {
              const step = (
                <li key={s.title} className="flex flex-col rounded-card border border-line bg-raised p-5 shadow-low">
                  <span className="tnum grid size-6 place-items-center rounded-full bg-ink text-xs font-medium text-on-ink">{i + 1}</span>
                  <h3 className="t-3 mt-4">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-2">{s.body}</p>
                  <div className="mt-auto pt-5"><p className="border-t border-line pt-3 text-xs font-medium text-ink-3">{s.note}</p></div>
                </li>
              );
              if (i === FLOW.length - 1) return [step];
              return [
                step,
                <li key={`a${i}`} aria-hidden className="grid place-items-center text-ink-4">
                  <ArrowDown className="size-4 lg:hidden" />
                  <ArrowRight className="hidden size-4 lg:block" />
                </li>,
              ];
            })}
          </ol>
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-3"><TokenIcon symbol="USDC" size={18} />Amounts are in the payment's own token: USDC on every network, and EURC where Arc lists it. The fee is always taken in that same token.</p>
        </Section>

        <CtaBand
          title="Want a different rate for your volume?"
          actions={[{ href: "/contact", label: "Contact us about rates", primary: true }, { href: "/signup", label: "Create an account" }]}
        >
          Tell us your volume and chains. Any rate is written into your payment addresses and can never exceed the contract's 1% cap. The contracts have been through a security audit.
        </CtaBand>
      </div>
    </>
  );
}
