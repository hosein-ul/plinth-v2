"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Bot, Code2, Link2 } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { CheckoutWindow } from "@/components/marketing/hero-visuals";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PUBLIC_API_URL, MCP_URL, SITE_URL } from "@/lib/config";
import { useHref } from "@/lib/data-source";

/**
 * "How do you want to get paid?": the three ways a merchant starts taking payments, each as the same short sequence of steps.
 * Every path ends the same way (the customer pays on the hosted checkout, funds go to the vault, the dashboard shows Received and
 * Settled), so the page explains the choice instead of listing features. Nothing here is stored or measured.
 */

const SNIPPET = `curl -X POST ${PUBLIC_API_URL}/v1/payment-intents \\
  -H "Authorization: Bearer sk_test_…" \\
  -H "Content-Type: application/json" \\
  -d '{"amount": "25.00",
       "order_reference": "ORDER-1042",
       "success_url": "https://yourshop.com/thanks"}'

# the response contains the page to send your customer to:
# { "id": "pi_…", "checkout_url": "${SITE_URL}/pay/pi_…", … }`;

export function WaysToGetPaid({ createAction }: { createAction?: React.ReactNode }) {
  const href = useHref();
  return (
    <section className="card mb-6 overflow-hidden" aria-label="Ways to get paid">
      <Tabs defaultValue="link">
        <div className="flex flex-col gap-5 border-b border-line p-5 sm:p-8">
          <div className="max-w-xl">
            <p className="label">Start here</p>
            <h2 className="t-2 mt-2 text-ink">
              How do you want to get paid?
              <span className="text-ink-3"> Pick the way that fits how you sell.</span>
            </h2>
          </div>
          <TabsList className="max-w-full flex-wrap self-start">
            <TabsTrigger value="link" className="inline-flex items-center gap-1.5 whitespace-nowrap"><Link2 className="size-3.5" aria-hidden />A link or button</TabsTrigger>
            <TabsTrigger value="api" className="inline-flex items-center gap-1.5 whitespace-nowrap"><Code2 className="size-3.5" aria-hidden />My website or app</TabsTrigger>
            <TabsTrigger value="chat" className="inline-flex items-center gap-1.5 whitespace-nowrap"><Bot className="size-3.5" aria-hidden />Chat or AI assistant</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="link" className="outline-none">
          <Path
            lead="No code. You make a link, your customer opens it and pays. Good for a shop in a chat, an invoice, a tip jar or a QR code on a counter."
            steps={[
              { title: "Create a payment link", body: "Give it a name and an amount, or let it be a fixed price. You can reuse it as often as you like.", action: <Button variant="primary" asChild><Link href={href("/dashboard/payment-links")}>Create a payment link <ArrowRight className="size-4" aria-hidden /></Link></Button> },
              { title: "Share it anywhere", body: "Paste it in a message, an email or a button on your page, or print it as a QR code." },
              { title: "Your customer pays on a Plinth page", body: "They choose a network and pay from their own wallet. They do not need an account, and Plinth never asks for a seed phrase." },
              { title: "The money goes to your vault", body: "This dashboard shows Received (final on-chain) and Settled (delivered to your vault) as two separate numbers." },
            ]}
            footer={createAction ? <div className="flex flex-wrap items-center gap-3 text-sm text-ink-3">Need one payment for one order instead? {createAction}</div> : <p className="text-sm text-ink-3">Need one payment for one order instead? Choose a network first, then use Create payment.</p>}
            visual={<Staged><CheckoutWindow phase={2} /></Staged>}
          />
        </TabsContent>

        <TabsContent value="api" className="outline-none">
          <Path
            lead="Your server asks Plinth for a payment, sends the customer to the hosted checkout, and fulfils the order when Plinth says it is paid. You never touch card data or private keys."
            steps={[
              { title: "Create an API key", body: "Test keys never move real funds. The full key is shown once.", action: <Button variant="primary" asChild><Link href={href("/dashboard/developers/api-keys")}>Create a key <ArrowRight className="size-4" aria-hidden /></Link></Button> },
              { title: "Create a payment from your server", body: "One request with the amount and your own order reference. The reply carries a checkout_url." },
              { title: "Send your customer to checkout_url", body: "Plinth's page handles the wallet, the network and the progress. After paying, the customer returns to your success_url." },
              { title: "Fulfil the order on the webhook", body: "You get a signed, retried request when the payment is final and again when it has settled. Ship the order on that, not on the redirect.", action: <Button asChild><Link href={href("/dashboard/developers/webhooks")}>Add a webhook endpoint</Link></Button> },
            ]}
            footer={<a href="/developers" className="inline-flex items-center gap-1 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink">Read the API guide<ArrowUpRight className="size-3.5" aria-hidden /></a>}
            visual={
              <div className="w-full max-w-[34rem] overflow-hidden rounded-card border border-line bg-raised">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <p className="font-mono text-2xs text-ink-3">create-payment.sh</p>
                  <CopyButton value={SNIPPET} label="Copy" compact />
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[0.75rem] leading-[1.7] text-ink-2"><code>{SNIPPET}</code></pre>
              </div>
            }
          />
        </TabsContent>

        <TabsContent value="chat" className="outline-none">
          <Path
            lead="Sell where your customers already are. The flow is the same as the API path; the chat only carries the checkout link, and an AI assistant can do the setup for you."
            steps={[
              { title: "Chat shop or Mini App", body: "Your bot or Mini App asks your server for a payment (the API path above) and sends the checkout_url as a Pay button. The customer pays in the in-app browser.", action: <Button variant="primary" asChild><Link href="/integrations">See chat integrations <ArrowRight className="size-4" aria-hidden /></Link></Button> },
              { title: "AI assistant", body: "Connect an assistant such as Claude to Plinth over MCP, with an API key, and ask it to create payment links or look up a payment. It cannot touch wallets, keys or your team.", action: <Button asChild><Link href="/build-with-ai">Connect an assistant</Link></Button> },
              { title: "The money still goes to your vault", body: "Whatever started the payment, you see it here the same way: Received first, then Settled." },
            ]}
            visual={
              <div className="w-full max-w-[34rem] rounded-card border border-line bg-raised p-5">
                <p className="label">MCP server address</p>
                <div className="mt-2 flex items-center justify-between gap-3 rounded-ctl bg-sunk px-3 py-2.5">
                  <code className="min-w-0 truncate font-mono text-[0.8125rem] text-ink">{MCP_URL}</code>
                  <CopyButton value={MCP_URL} label="Copy" compact />
                </div>
                <p className="mt-3 text-sm text-ink-3">Paste it into your assistant as a remote MCP server and sign in with an API key.</p>
              </div>
            }
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

interface PathStep { title: string; body: string; action?: React.ReactNode }

function Path({ lead, steps, footer, visual }: { lead: string; steps: PathStep[]; footer?: React.ReactNode; visual: React.ReactNode }) {
  return (
    <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
      <div>
        <p className="max-w-lg text-[0.9375rem] text-ink-2">{lead}</p>
        <ol className="mt-6 divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 py-4 first:pt-0">
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-ink text-xs font-medium tnum text-on-ink">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-sm text-ink-3">{s.body}</p>
                {s.action && <div className="mt-3">{s.action}</div>}
              </div>
            </li>
          ))}
        </ol>
        {footer && <div className="mt-2 border-t border-line pt-4">{footer}</div>}
      </div>
      <div className="dotgrid flex items-start justify-center overflow-hidden rounded-card bg-wash p-4 [--dot-x:50%] [--dot-y:30%] sm:p-6">{visual}</div>
    </div>
  );
}

/** The marketing checkout is drawn at a fixed width: shrink it to the width of its column, and leave it out on phones. */
function Staged({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / 468) || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="hidden w-full min-[700px]:block">
      <div className="mx-auto w-[468px]" style={{ zoom }}>{children}</div>
    </div>
  );
}
