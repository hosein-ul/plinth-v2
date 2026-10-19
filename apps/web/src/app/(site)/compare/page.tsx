import { Check, Minus } from "lucide-react";
import { PageIntro } from "@/components/marketing/chrome";
import { TableCard, td, wrap } from "@/components/marketing/parts";
import { CtaBand, JsonLd, Section } from "@/components/marketing/pages/pages-kit";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Custodial vs non-custodial",
  description: "A structural comparison of custodial payment processors and non-custodial vault settlement, by category. It names no company and makes no claim about any.",
  path: "/compare",
});

const ROWS: [string, string, string][] = [
  ["Where funds sit while a payment is in flight", "In an account the processor controls. The merchant's balance is an entry in the processor's books.", "At an address that can only ever pay the merchant's vault. No account balance exists on the gateway side."],
  ["Who can move settled funds", "The processor, and the merchant through the processor's permission system.", "Only the vault owner, an address the merchant chooses. The gateway has no role in the vault."],
  ["If the operator is compromised", "Funds held in the operator's accounts are exposed to the compromise.", "By design the operator cannot withdraw or redirect. Service can still be disrupted."],
  ["If the operator disappears", "Access depends on the operator, its processes and its jurisdiction.", "Funds already swept stay in the vault under the owner's key. Pending payments depend on someone running the relayer."],
  ["Settlement path", "Customer to processor account, then payout to the merchant on the processor's schedule.", "Customer to invoice address to merchant vault, in one sweep transaction after finality."],
  ["Who pays network gas", "Whoever the processor's model assigns it to.", "Wallet payments are gasless for the customer. The relayer pays sweep gas and records the cost."],
  ["Reversals and refunds", "Can be initiated from inside the processor's account.", "A refund is a new transfer the merchant sends from the vault, proven by its transaction hash."],
  ["Account recovery", "A support process can restore access.", "A lost owner key cannot be recovered by anyone. A multisig owner is recommended."],
  ["Trust you extend to the operator", "Custody, plus correct bookkeeping and solvency.", "Correct detection and status, and uptime. Not custody."],
];

const COSTS = [
  "You manage a key. Losing it loses access to the vault.",
  "Your balance is in USDC. Plinth does not convert to or pay out in other currencies.",
  "The token issuer can block addresses, and a blocked vault cannot be paid.",
  "The contracts have been through a security audit. Arc is live today; other networks are opening soon.",
  "Refunds need you to send a transfer yourself; there is no refund button that works without your key.",
];

const FITS = [
  "You want customers' payments to land in an address you control, with a short list of what the gateway can do.",
  "You are comfortable operating a wallet or multisig, and you can wait for an audit before taking real value.",
  "You want status derived from on-chain facts and delivered through signed webhooks.",
];

export default function ComparePage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Custodial vs non-custodial payment settlement", description: "Structural comparison of two settlement models." }} />
      <PageIntro eyebrow="Compare" title="Where the money sits decides who you have to trust">
        This compares two models, not companies. It names none and says nothing about any real product. Use it to decide which kind of risk you would rather carry.
      </PageIntro>
      <div className={cn(wrap, "space-y-24 py-14")}>
        <Section id="table" title="Category by category" lead="Descriptions of each model in general terms. A particular product may differ on any row.">
          <TableCard caption="Custodial processor model compared with non-custodial vault settlement" minWidth="52rem" head={["Category", "Custodial processor model", "Non-custodial vault settlement (Plinth)"]}>
            {ROWS.map(([k, a, b]) => (
              <tr key={k} className="transition-colors hover:bg-wash">
                <th scope="row" className={cn(td, "w-56 text-left font-medium text-ink")}>{k}</th>
                <td className={cn(td, "text-ink-2")}>{a}</td>
                <td className={cn(td, "bg-wash text-ink")}>{b}</td>
              </tr>
            ))}
          </TableCard>
        </Section>

        <div className="grid gap-12 lg:grid-cols-2">
          <Section id="costs" title="What you take on">
            <ul className="space-y-3 text-[0.9375rem] text-ink-2">
              {COSTS.map((c) => <li key={c} className="grid grid-cols-[1.5rem_1fr] gap-2"><Minus className="mt-1 size-4 text-warn" strokeWidth={2.5} aria-hidden />{c}</li>)}
            </ul>
          </Section>
          <Section id="fits" title="When this model fits">
            <ul className="space-y-3 text-[0.9375rem] text-ink-2">
              {FITS.map((c) => <li key={c} className="grid grid-cols-[1.5rem_1fr] gap-2"><Check className="mt-1 size-4 text-ink-2" strokeWidth={2.5} aria-hidden />{c}</li>)}
            </ul>
          </Section>
        </div>

        <CtaBand title="Judge the claims yourself" actions={[{ href: "/security", label: "Read the security model", primary: true }, { href: DEMO_HREF, label: "Try the demo" }]}>
          The security page lists who can do what, and the limitations that apply today.
        </CtaBand>
      </div>
    </>
  );
}
