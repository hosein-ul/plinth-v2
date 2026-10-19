import { Brush, Gift, Repeat, ShoppingBag, Users } from "lucide-react";
import { PageIntro } from "@/components/marketing/chrome";
import { C } from "@/components/marketing/code";
import { wrap } from "@/components/marketing/parts";
import { CtaBand, JsonLd } from "@/components/marketing/pages/pages-kit";
import { InvoiceFragment, LinkFragment, PlatformFragment, SaasFragment, StoreFragment } from "@/components/marketing/pages/use-case-fragments";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Use cases",
  description: "Five ways to take USDC with Plinth: online stores, SaaS billing, invoices for freelancers and marketplaces, platforms and agencies, and donation links. Each maps to the real product objects.",
  path: "/use-cases",
});

interface UseCase {
  id: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  lead: string;
  flow: string[];
  objects: [string, React.ReactNode][];
  limit: string;
  fragment: React.ReactNode;
}

const CASES: UseCase[] = [
  {
    id: "online-stores",
    icon: ShoppingBag,
    title: "Online stores",
    lead: "Create one payment per order, send the customer to the checkout page, and release the order when a verified webhook says the funds are final.",
    flow: [
      "Your backend creates a payment intent with the order reference and success URL.",
      "The customer opens checkout_url and pays by wallet or by sending USDC to the unique address.",
      "Plinth verifies the transfer and waits for finality, then sweeps it into your vault.",
      "Your webhook handler fulfils the order on payment.confirmed, or strictly on payment.completed.",
    ],
    objects: [
      ["payment_intent", <>amount, order_reference, success_url, cancel_url, expires_in_seconds, metadata</>],
      ["webhook event", <>payment.confirmed, payment.completed, payment.underpaid, payment.late</>],
      ["POST /v1/payment-intents", <>Idempotent via <C>Idempotency-Key</C></>],
    ],
    limit: "There are no store plugins yet. You call the API from your own backend.",
    fragment: <StoreFragment />,
  },
  {
    id: "saas-billing",
    icon: Repeat,
    title: "SaaS and subscription billing",
    lead: "Bill each period as its own payment. Because a customer pushes USDC from their own wallet, Plinth cannot pull a recurring charge, so your scheduler creates the payment and sends the link.",
    flow: [
      "At each renewal your scheduler creates a payment intent with the customer email and a period reference.",
      "You send the checkout link yourself. Plinth does not send email.",
      "The webhook marks the period paid. An expired or underpaid intent tells you to follow up.",
      "Overpayments and late payments arrive as their own events, so nothing is silently absorbed.",
    ],
    objects: [
      ["payment_intent", <>amount, customer_email, order_reference, expires_in_seconds</>],
      ["webhook event", <>payment.confirmed, payment.expired, payment.overpaid</>],
      ["GET /v1/payments", <>List and search payments by reference</>],
    ],
    limit: "No subscription object, no auto-charge and no dunning exists. Recurrence lives in your system.",
    fragment: <SaasFragment />,
  },
  {
    id: "invoices",
    icon: Brush,
    title: "Freelancers and small marketplaces",
    lead: "Send a numbered invoice with line items and a due date. The customer pays from the invoice link and you see settlement in your own vault.",
    flow: [
      "Create an invoice from the dashboard or the API with the customer and line items.",
      "Share the invoice link. Invoices are not emailed by Plinth yet.",
      "The customer pays by wallet or address; partial payments add up until the invoice is covered.",
      "The invoice moves to paid when the verified, final total reaches the amount.",
    ],
    objects: [
      ["invoice", <>customer_name, customer_email, memo, due_in_days, line_items[description, quantity, unit_amount]</>],
      ["POST /v1/invoices", <>Idempotent; returns the invoice and its payment</>],
      ["refund request", <>A refund is a transfer you send from your vault, then prove with its hash</>],
    ],
    limit: "There is no split payment or sub-merchant API. A marketplace would give each seller their own account, or pay sellers from its own vault.",
    fragment: <InvoiceFragment />,
  },
  {
    id: "platforms",
    icon: Users,
    title: "Platforms and agencies",
    lead: "Give each team the access it needs, keep every API call and webhook attempt on record, and let a client's own multisig own the vault.",
    flow: [
      "Each client or project signs up and creates a vault owned by an address the client controls.",
      "Teammates get an owner, admin, developer or viewer role.",
      "Developers create API keys, register webhook endpoints and inspect every delivery attempt.",
      "The audit log records sensitive actions, with secrets and signatures redacted.",
    ],
    objects: [
      ["team member", <>email, role (OWNER, ADMIN, DEVELOPER, VIEWER)</>],
      ["api key", <>a secret key, shown once and rotatable</>],
      ["webhook endpoint", <>https only; signed with <C>Plinth-Signature</C>; manual retry from the log</>],
    ],
    limit: "Each account is isolated. There is no multi-account console for agencies yet.",
    fragment: <PlatformFragment />,
  },
  {
    id: "donations",
    icon: Gift,
    title: "Donations and tips",
    lead: "Publish a payment link with a fixed amount. Each visit opens a fresh payment, so one link can take any number of payments.",
    flow: [
      "Create a payment link with a name, a fixed amount and an optional success URL.",
      "Share the link anywhere. No code or backend is needed.",
      "Opening the link creates a new payment and sends the visitor to the checkout page.",
      "Funds land in your vault; the dashboard lists every payment under that link.",
    ],
    objects: [
      ["payment_link", <>name, amount, description, success_url, intent_expires_in_seconds</>],
      ["POST /v1/payment-links", <>Idempotent; PATCH to switch a link off</>],
      ["payment_intent", <>One is created each time the link is opened</>],
    ],
    limit: "Amounts are fixed. For several tip sizes, create several links. There is no pay-what-you-want amount yet.",
    fragment: <LinkFragment />,
  },
];

export default function UseCasesPage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", name: "Plinth use cases", itemListElement: CASES.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.title, url: `/use-cases#${c.id}` })) }} />
      <PageIntro eyebrow="Use cases" title="Five ways to take USDC, each on real product objects">
        Every flow below uses surfaces and API objects that exist today. Where something does not exist yet, the section says so. The data in the pictures is sample data, not a customer.
      </PageIntro>
      <div className={cn(wrap, "space-y-24 py-14")}>
        {CASES.map((c, i) => (
          <section key={c.id} id={c.id} aria-labelledby={`${c.id}-h`} className="scroll-mt-28">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
              <div className={cn("min-w-0", i % 2 === 1 && "lg:order-2")}>
                <span className="grid size-11 place-items-center rounded-[13px] bg-ink text-on-ink shadow-btn"><c.icon className="size-5" aria-hidden /></span>
                <h2 id={`${c.id}-h`} className="t-2 mt-5">{c.title}</h2>
                <p className="mt-3 text-[0.9375rem] text-ink-2">{c.lead}</p>
                <ol className="mt-7 space-y-3 text-[0.9375rem] text-ink-2">
                  {c.flow.map((s, n) => (
                    <li key={s} className="grid grid-cols-[1.75rem_1fr] gap-3"><span className="tnum mt-0.5 grid size-6 place-items-center rounded-full bg-sunk text-xs font-medium text-ink-2">{n + 1}</span><span>{s}</span></li>
                  ))}
                </ol>
                <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
                  {c.objects.map(([k, v]) => (
                    <div key={k} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                      <dt className="font-mono text-[0.8125rem] font-medium text-ink">{k}</dt>
                      <dd className="text-ink-2">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-sm text-ink-3"><span className="font-medium text-ink-2">Not today:</span> {c.limit}</p>
              </div>
              <div className={cn("min-w-0 lg:sticky lg:top-24", i % 2 === 1 && "lg:order-1")}>{c.fragment}</div>
            </div>
          </section>
        ))}

        <CtaBand title="Try the flow that matches yours" actions={[{ href: DEMO_HREF, label: "Open the demo", primary: true }, { href: "/developers", label: "Read the API docs" }, { href: "/integrations", label: "See integrations" }]}>
          Create an account, make a vault and take your first payment on Arc.
        </CtaBand>
      </div>
    </>
  );
}
