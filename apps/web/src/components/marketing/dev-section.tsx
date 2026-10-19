"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Code } from "@/components/marketing/code";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { buttonStyles } from "@/components/ui/button";
import { Band } from "@/components/marketing/band";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { WipeStack, useWipe } from "@/components/marketing/motion/wipe-stack";
import { cn } from "@/lib/cn";

const CURL = `curl -X POST $PLINTH_API/v1/payment-intents \\
  -H "Authorization: Bearer sk_…" \\
  -H "Idempotency-Key: ORDER_ID" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": "25.00", "order_reference": "ORDER_ID" }'

# → { "status": "AWAITING_PAYMENT", "checkout_url": "…" }`;

const NODE = `const res = await fetch(\`\${process.env.PLINTH_API}/v1/payment-intents\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.PLINTH_SECRET_KEY}\`,
    "Idempotency-Key": "ORDER_ID",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ amount: "25.00", order_reference: "ORDER_ID" }),
});
const intent = await res.json();
// send the customer to intent.checkout_url`;

const VERIFY = `// header: Plinth-Signature: t=<unix>,v1=<hex>
const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const mac = crypto.createHmac("sha256", secret).update(t + "." + rawBody).digest("hex");
const ok = Math.abs(Date.now() / 1000 - Number(t)) < 300 &&
           crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(v1));
// ok === true  →  fulfil on payment.confirmed, deduplicate on event.id`;

const CODE = "border border-white/10 bg-ink-deep shadow-none";
const TABS = [["curl", "cURL"], ["node", "Node"], ["verify", "Verify webhook"]] as const;

const FACTS = [
  ["Exact amounts", "Decimal strings with integer twins. No floats."],
  ["Idempotent", "Retry a request with the same key and get the same payment."],
  ["Signed webhooks", "HMAC-SHA256, 5 minute window, 8 retries over about 10 hours."],
  ["Truthful status", "Derived from verified on-chain facts, never from a redirect."],
];

export function DevSection({ events }: { events: string[] }) {
  const groups = ["payment", "settlement", "refund"].map((g) => [g, events.filter((e) => e.startsWith(g + "."))] as const);
  const wipe = useWipe(TABS.length);
  const panels = [
    <Code key="c" label="create a payment" className={CODE}>{CURL}</Code>,
    <Code key="n" label="node, create a payment" className={CODE}>{NODE}</Code>,
    <Code key="v" label="node, verify a webhook" className={CODE}>{VERIFY}</Code>,
  ];
  return (
    <Band tone="dark" labelledBy="dev-h" className="[--grid-x:65%] [--grid-y:30%]">
      <div aria-hidden className="tint-mint-tr pointer-events-none absolute inset-x-0 top-0 h-[34rem]" />
      <div className={wrap}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div>
            <RevealHeading id="dev-h" as="h2" mode="line" className="t-1 text-on-ink" parts={[["One request to create a payment.", "text-on-ink"], ["One signed webhook when it is safe to fulfil.", "text-white/45"]]} />
            <Reveal delay={0.1}>
              <dl className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {FACTS.map(([k, v]) => (
                  <div key={k}><dt className="text-sm font-semibold text-on-ink">{k}</dt><dd className="mt-1 text-sm text-white/60">{v}</dd></div>
                ))}
              </dl>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/developers" className={cn(buttonStyles({ variant: "secondary", size: "lg" }), "border-transparent")}>Read the docs<ArrowRight className="size-4" aria-hidden /></Link>
                <Link href="/developers#webhooks" className="inline-flex h-11 items-center rounded-ctl px-4 text-[0.9375rem] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">Webhook events</Link>
              </div>
            </Reveal>
          </div>
          <ClipReveal variant="polygon" duration={1.1} className="min-w-0">
            <div role="tablist" aria-label="Code sample" className="relative inline-grid grid-cols-3 rounded-ctl bg-white/10 p-1">
              {TABS.map(([v, l], i) => {
                const on = wipe.cur === i;
                return (
                  <button key={v} role="tab" type="button" aria-selected={on} onClick={(e) => wipe.go(i, e)} className={cn("relative z-10 inline-flex h-8 items-center justify-center rounded-[8px] px-3.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]", on ? "text-ink" : "text-white/60 hover:text-white")}>
                    {on && <motion.span layoutId="dev-thumb" className="absolute inset-0 -z-10 rounded-[8px] bg-white" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                    {l}
                  </button>
                );
              })}
            </div>
            <div className="mt-4"><WipeStack wipe={wipe} panels={panels} /></div>
            <div className="mt-6">
              <p className="text-xs font-medium text-white/45">Events you can subscribe to</p>
              <div className="mt-3 space-y-2">
                {groups.map(([g, list]) => (
                  <div key={g} className="flex flex-wrap gap-1.5">
                    {list.map((e) => <span key={e} className="rounded-md border border-white/12 bg-white/[0.05] px-2 py-1 font-mono text-2xs text-white/80">{e}</span>)}
                  </div>
                ))}
              </div>
            </div>
          </ClipReveal>
        </div>
      </div>
    </Band>
  );
}
