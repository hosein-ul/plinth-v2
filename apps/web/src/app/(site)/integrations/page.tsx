import Link from "next/link";
import { CreditCard, FileText, Link2, Webhook, Braces, KeyRound, Cable, Mail, Puzzle, Package, ShieldCheck, Layers, Repeat } from "lucide-react";
import { ChainIcon, TokenIcon, WalletIcon } from "@/components/brand";
import { PageIntro } from "@/components/marketing/chrome";
import { C } from "@/components/marketing/code";
import { wrap } from "@/components/marketing/parts";
import { CopyCode } from "@/components/marketing/pages/copy-code";
import { AvailChip, CtaBand, JsonLd, Section, inlineLink, type Availability } from "@/components/marketing/pages/pages-kit";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Integrations",
  description: "What you can connect to Plinth today (checkout page, payment links, invoices, REST API, signed webhooks) and what is still in progress or planned.",
  path: "/integrations",
});

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
interface Item { icon?: Icon; mark?: React.ReactNode; name: string; body: React.ReactNode; state: Availability; where?: [string, string] }

const ITEMS: Item[] = [
  { icon: CreditCard, name: "Checkout page", body: "A payment page with two methods: pay with a connected wallet (gasless, one signature) or send USDC to a unique address. Status comes from the backend only.", state: "available", where: ["See it in the demo", DEMO_HREF] },
  { icon: Link2, name: "Payment links", body: "Reusable fixed-amount links at /l/{slug}. Opening one creates a fresh payment.", state: "available", where: ["Use cases", "/use-cases#donations"] },
  { icon: FileText, name: "Invoices", body: "Numbered invoices with line items and a due date, shared as a link. They are not emailed by Plinth.", state: "available", where: ["Use cases", "/use-cases#invoices"] },
  { icon: Braces, name: "REST API and OpenAPI", body: "Versioned under /v1 with an OpenAPI 3.1 document generated from the same route definitions the server registers. Exact decimal amounts, structured errors, idempotency keys.", state: "available", where: ["Developers", "/developers#api"] },
  { icon: Webhook, name: "Signed webhooks", body: "13 event types, HMAC-SHA256 signature, 8 retries over about 10 hours, a delivery log and manual retry.", state: "available", where: ["Webhook guide", "/developers#webhooks"] },
  { icon: KeyRound, name: "API keys and team roles", body: "Hashed test and live keys, rotation, four team roles and an audit log.", state: "available", where: ["Security", "/security"] },
  { mark: <span className="flex -space-x-1.5"><ChainIcon id="arc-mainnet" size={22} /></span>, name: "Arc mainnet", body: "Live with USDC and EURC. Other mainnets are in the registry with their tokens probed and open once their contracts are deployed.", state: "available", where: ["Networks", "/networks"] },
  { icon: Repeat, name: "Cross-chain consolidation (CCTP)", body: "Circle CCTP domains are recorded per network. The transfer lifecycle is designed but not implemented.", state: "in-progress" },
  { icon: ShieldCheck, name: "KMS or HSM relayer signer", body: "Signing goes through a SignerProvider interface. Only an environment-key implementation exists.", state: "in-progress" },
  { icon: Puzzle, name: "E-commerce plugins", body: "No plugin code exists in the repository. Today you integrate through the API.", state: "planned" },
  { icon: Package, name: "Official SDKs", body: "No SDK exists. The OpenAPI document can be used to generate a client.", state: "planned" },
  { mark: <WalletIcon id="walletconnect" size={28} />, name: "WalletConnect and mobile wallets", body: "Checkout discovers browser-injected wallets only (EIP-6963). Mobile wallets can use the address flow.", state: "planned" },
  { icon: Cable, name: "Smart-contract wallet payers", body: "Contract wallets need an EIP-1271 path on the gasless route. They can use the address flow today.", state: "planned" },
  { icon: Mail, name: "Email delivery", body: "Invoices and receipts are shared as links; the platform sends no email.", state: "planned" },
  { icon: Layers, name: "Solana", body: "Would be a separate adapter, since it cannot reuse CREATE2 or EIP-3009. Not started.", state: "planned" },
  { mark: <TokenIcon symbol="USDC" size={28} />, name: "Gateway Nanopayments", body: "A different model from invoice checkout. Support on the target networks is unconfirmed, so nothing is integrated.", state: "planned" },
];

const GROUPS: { state: Availability; title: string; note: string }[] = [
  { state: "available", title: "Available now", note: "Code exists, is covered by tests in the repository, and runs on Arc." },
  { state: "in-progress", title: "In progress", note: "Groundwork is in the repository, but it is not usable end to end." },
  { state: "planned", title: "Planned", note: "Noted as a limitation or design in the repository. No committed date." },
];

const CURL = `# 1. Create a payment (idempotent)
curl -X POST $PLINTH_API/v1/payment-intents \\
  -H "Authorization: Bearer $PLINTH_KEY" \\
  -H "Idempotency-Key: order-1042" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": "25.00", "order_reference": "order-1042" }'

# 2. Register a webhook endpoint (the secret is shown once)
curl -X POST $PLINTH_API/v1/webhook-endpoints \\
  -H "Authorization: Bearer $PLINTH_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "url": "https://YOUR_DOMAIN/plinth/webhook", "events": ["payment.confirmed", "payment.completed"] }'`;

const NODE = `import crypto from "node:crypto";
import express from "express";

// Create a payment and send the customer to payment.checkout_url
const res = await fetch(process.env.PLINTH_API + "/v1/payment-intents", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.PLINTH_KEY,
    "Idempotency-Key": "order-1042",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ amount: "25.00", order_reference: "order-1042" }),
});
const payment = await res.json();

// Verify the signature on the raw body, then fulfil on payment.confirmed
const app = express();
app.post("/plinth/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const parts = Object.fromEntries(
    (req.get("Plinth-Signature") ?? "").split(",").map((p) => p.split("=")),
  );
  const mac = crypto
    .createHmac("sha256", process.env.PLINTH_WEBHOOK_SECRET)
    .update(parts.t + "." + req.body)
    .digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  const ok = fresh && mac.length === (parts.v1 ?? "").length &&
    crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(parts.v1));
  if (!ok) return res.sendStatus(400);

  const event = JSON.parse(req.body.toString());
  // De-duplicate on event.id, then act on event.type
  res.sendStatus(200);
});`;

export default function IntegrationsPage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Plinth integrations", description: "Available, in-progress and planned Plinth integrations." }} />
      <PageIntro eyebrow="Integrations" title="What connects today, and what does not">
        Plinth is an API and a checkout page. Everything marked available exists and is tested in the repository. Everything else is labelled as exactly that.
      </PageIntro>
      <div className={cn(wrap, "space-y-24 py-14")}>
        {GROUPS.map((g) => (
          <Section key={g.state} id={g.state} title={g.title} lead={g.note}>
            <ul className="card divide-y divide-line">
              {ITEMS.filter((i) => i.state === g.state).map((i) => (
                <li key={i.name} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_7rem] sm:items-center sm:px-6">
                  <span className="row-span-2 grid size-10 place-items-center rounded-ctl bg-sunk text-ink-2 sm:row-span-1">
                    {i.mark ?? (i.icon && <i.icon className="size-5" aria-hidden />)}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[0.9375rem] font-semibold text-ink">{i.name}</h3>
                    <p className="mt-0.5 text-sm text-ink-2">{i.body}</p>
                  </div>
                  <span className="col-start-2 sm:col-start-auto"><AvailChip state={i.state} /></span>
                  <span className="col-start-2 text-sm sm:col-start-auto sm:text-right">
                    {i.where && <Link className={inlineLink} href={i.where[1]}>{i.where[0]}</Link>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ))}

        <Section id="samples" title="Connect in two calls" lead={<>Create a payment, then verify and act on the webhook. Replace <C>PLINTH_API</C> with your API host and use your secret key.</>}>
          <div className="grid gap-6 xl:grid-cols-2">
            <CopyCode label="cURL">{CURL}</CopyCode>
            <CopyCode label="Node.js (v22, Express)">{NODE}</CopyCode>
          </div>
          <p className="mt-5 max-w-2xl text-sm text-ink-3">These samples follow <C>docs/api-guide.md</C> and the reference verifier in the repository. They are illustrative and have not been published as an SDK.</p>
        </Section>

        <CtaBand title="Missing an integration you need?" actions={[{ href: "/contact", label: "Tell us what you need", primary: true }, { href: "/developers", label: "Developer docs" }]}>
          Planned items have no dates. Knowing which one blocks you helps decide what to build first.
        </CtaBand>
      </div>
    </>
  );
}
