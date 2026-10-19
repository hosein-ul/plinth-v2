import Link from "next/link";
import { ArrowRight, Check, CreditCard, ShoppingCart, Webhook, Wallet } from "lucide-react";
import { PageIntro } from "@/components/marketing/chrome";
import { MCP_URL } from "@/lib/ai-kit";
import { AiKitPicker } from "@/components/marketing/pages/ai-kit-picker";
import { CopyCode } from "@/components/marketing/pages/copy-code";
import { Chip } from "@/components/badge";
import { buttonStyles } from "@/components/ui/button";
import { H2, wrap } from "@/components/marketing/parts";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({ title: "Build with AI", description: "Already have an app or a site? Connect your AI assistant to Plinth and ask for payments in plain English. Every order is charged at its real total.", path: "/build-with-ai" });

const FLOW = [
  { icon: ShoppingCart, title: "Customer checks out", text: "In your app, as it works today." },
  { icon: CreditCard, title: "Your server asks Plinth", text: "With the order's real total. Automatic, every time." },
  { icon: Wallet, title: "Plinth checkout opens", text: "A clean page where they pick a network and pay." },
  { icon: Webhook, title: "Your app is told", text: "A signed message. Your order flips to paid." },
];

const STEPS: [string, string][] = [
  ["Connect your assistant", "Add the Plinth MCP server with one URL and your key, or skip this and use the prompt. The server lets your assistant create and check payments, links, invoices and webhooks itself."],
  ["Ask in plain English", "Paste the prompt for the kind of project you have. It tells the assistant to work inside your existing code."],
  ["Check four results", "A real total is charged, the order turns paid from the webhook only, a forged webhook is rejected, a replayed one is ignored."],
];

const MCP_CONFIG = `{
  "mcpServers": {
    "plinth": {
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer sk_..." }
    }
  }
}`;

const MCP_CLAUDE_CODE = `claude mcp add --transport http plinth ${MCP_URL} --header "Authorization: Bearer sk_..."`;

const KIT: { name: string; text: string; ok: boolean }[] = [
  { name: "MCP server (hosted)", text: "One URL, your key in a header. 29 tools: payments, payment links, invoices, refunds, webhooks and reports, plus the integration playbook, a ready prompt and resources. It cannot change where money goes.", ok: true },
  { name: "Plain-text docs for assistants", text: "/llms.txt and /llms-full.txt, generated from the same playbook the MCP server serves.", ok: true },
  { name: "Copy-and-paste prompts", text: "One prompt, tuned for a store, a SaaS, a bot or bookings. Each ends with a checklist.", ok: true },
  { name: "Safe by design", text: "No tool can change payout destinations, keys or team.", ok: true },
  { name: "SDKs and framework starters", text: "Not published. The REST API works from any language today.", ok: false },
];

export default function BuildWithAiPage() {
  return (
    <>
      <PageIntro eyebrow="Build with AI" title="Already have an app? Ask your AI assistant to add payments.">
        Connect it to Plinth and describe what you want in plain English. It adds checkout to the project you already have, and every order is charged at its real total.
      </PageIntro>

      <section className={`${wrap} py-16`} aria-labelledby="ai-flow">
        <H2 id="ai-flow">What your customers will see.</H2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((f, i) => (
            <li key={f.title} className="relative rounded-[1.5rem] border border-line bg-raised p-5 shadow-low">
              <span className="grid size-10 place-items-center rounded-[12px] bg-sunk text-ink"><f.icon className="size-5" aria-hidden /></span>
              <p className="mt-4 text-[0.75rem] font-medium tabular-nums text-ink-4">0{i + 1}</p>
              <h3 className="mt-1 text-[1.0625rem] font-medium tracking-[-0.02em] text-ink">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-3">{f.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-2xl text-[0.9375rem] text-ink-3">No payment link is made by hand and no product is set up in Plinth. Your app already knows what was bought and how much it costs; it just tells Plinth.</p>
      </section>

      <section className="bg-sunk/60 py-16" aria-labelledby="ai-how">
        <div className={wrap}>
          <H2 id="ai-how">Three steps.</H2>
          <ol className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
            {STEPS.map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium tabular-nums text-on-ink">{i + 1}</span>
                <div><h3 className="text-lg font-medium tracking-[-0.02em] text-ink">{t}</h3><p className="mt-1 text-[0.9375rem] text-ink-2">{b}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className={buttonStyles({ variant: "primary", size: "lg" })}>Create an account<ArrowRight className="size-4" aria-hidden /></Link>
            <Link href={DEMO_HREF} className={buttonStyles({ variant: "secondary", size: "lg" })}>Look around the demo first</Link>
          </div>
        </div>
      </section>

      <section className={`${wrap} py-16`} aria-labelledby="ai-connect">
        <H2 id="ai-connect">1. Connect your assistant (optional).</H2>
        <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">Works with any assistant that supports MCP over HTTP (Claude, Cursor, and others). The server URL is <span className="font-mono text-[0.8125rem] text-ink">{MCP_URL}</span>. Send your secret key as a Bearer token; create a key in your dashboard under Developers, API keys.</p>
        <div className="mt-6 grid max-w-2xl gap-4"><CopyCode label="mcp settings · json">{MCP_CONFIG}</CopyCode><CopyCode label="claude code · one line">{MCP_CLAUDE_CODE}</CopyCode></div>
      </section>

      <section className="bg-sunk/60 py-16" aria-labelledby="ai-prompts">
        <div className={wrap}>
          <H2 id="ai-prompts">2. Paste the prompt for your project.</H2>
          <div className="mt-8"><AiKitPicker /></div>
        </div>
      </section>

      <section className={`${wrap} py-16`} aria-labelledby="ai-kit">
        <H2 id="ai-kit">What is in the kit, and what is not yet.</H2>
        <ul className="mt-8 divide-y divide-line rounded-card border border-line bg-raised">
          {KIT.map((k) => (
            <li key={k.name} className="flex items-center gap-4 px-5 py-4">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunk text-ink-3">{k.ok ? <Check className="size-3.5 text-signal-ink" strokeWidth={3} aria-hidden /> : <span aria-hidden className="size-1.5 rounded-full bg-ink-4" />}</span>
              <div className="min-w-0 flex-1"><p className="font-medium text-ink">{k.name}</p><p className="text-sm text-ink-3">{k.text}</p></div>
              <Chip tone={k.ok ? "ok" : "neutral"}>{k.ok ? "Available" : "Planned"}</Chip>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
