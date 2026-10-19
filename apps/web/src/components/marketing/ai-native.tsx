/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, Check, FileText, ListChecks, Plug, ShieldCheck } from "lucide-react";
import { siWindsurf } from "simple-icons";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { buttonStyles } from "@/components/ui/button";
import { MCP_URL } from "@/lib/ai-kit";

/** What an agent gets, in the words the build-with-AI page uses. Every row is built and running. */
const FEATURES = [
  { icon: Plug, title: "A hosted MCP server", text: "One URL and your key in a header, nothing to install. 29 tools for payments, links, invoices, refunds, webhooks and reports, plus the integration playbook." },
  { icon: FileText, title: "Docs written for agents", text: "/llms.txt and /llms-full.txt, generated from the same playbook the MCP server serves, and an OpenAPI 3.1 document." },
  { icon: ListChecks, title: "A prompt per project", text: "One for a store, a SaaS, a bot or bookings. Each ends with the four checks the agent must pass." },
  { icon: ShieldCheck, title: "Safe by design", text: "Idempotency keys and signed webhooks make a repeated call harmless. No tool changes where money goes: payout wallets, vaults, keys and the team need you, signed in." },
] as const;

/** Real marks from the lobehub icon set (MIT, copied into /public/brand/ai); Windsurf from simple-icons. Marks belong to their owners. */
const AGENTS: { name: string; src?: string }[] = [
  { name: "Claude Code", src: "claudecode" },
  { name: "OpenAI Codex", src: "codex" },
  { name: "Cursor", src: "cursor" },
  { name: "GitHub Copilot", src: "githubcopilot" },
  { name: "Gemini CLI", src: "geminicli" },
  { name: "Windsurf" },
  { name: "Cline", src: "cline" },
  { name: "Devin", src: "devin" },
];

function AgentMark({ name, src }: { name: string; src?: string }) {
  if (!src) {
    return (
      <svg role="img" aria-label={name} viewBox="0 0 24 24" width={30} height={30} fill="currentColor" className="text-ink">
        <path d={siWindsurf.path} />
      </svg>
    );
  }
  return <img src={`/brand/ai/${src}.svg`} alt="" width={30} height={30} className="size-[30px]" />;
}

const CHECKS = ["A real total is charged", "Paid only from the webhook", "A forged webhook is rejected", "A replayed one is ignored"];

/** A staged agent session: the mechanism, not a screenshot. The tool names are the MCP server's own. */
function Session() {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-line-strong bg-ground shadow-float">
      <div className="flex items-center gap-2 border-b border-line bg-raised px-4 py-3">
        <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /></span>
        <span className="mx-auto text-xs font-medium text-ink-3">Your assistant, in your project</span>
        <span className="w-10" />
      </div>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm font-medium text-on-ink">Add Plinth checkout to my store.</div>
        <div className="max-w-[94%] space-y-2.5">
          <p className="text-sm text-ink-2">I will read the playbook, create a payment and check the result.</p>
          <div className="space-y-1.5 rounded-2xl border border-line bg-raised p-3 font-mono text-[0.8125rem] text-ink shadow-low">
            <p className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-signal" strokeWidth={3} aria-hidden />get_integration_playbook<span className="text-ink-3">()</span></p>
            <p className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-signal" strokeWidth={3} aria-hidden />list_networks<span className="text-ink-3">()</span></p>
            <p className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-signal" strokeWidth={3} aria-hidden />create_payment<span className="truncate text-ink-3">({`{ amount: "25.00" }`})</span></p>
            <p className="flex items-center gap-2"><Check className="size-3.5 shrink-0 text-signal" strokeWidth={3} aria-hidden />get_payment<span className="text-ink-3">(&quot;AWAITING_PAYMENT&quot;)</span></p>
          </div>
          <ul className="grid gap-1.5 rounded-2xl bg-sunk p-3 text-sm text-ink sm:grid-cols-2">
            {CHECKS.map((c) => (
              <li key={c} className="flex items-center gap-2"><span className="grid size-4 shrink-0 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-2.5" strokeWidth={4} aria-hidden /></span>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">An illustration of a session. Tool names are the MCP server&apos;s own.</p>
    </div>
  );
}

/**
 * The agent-native side of the product, told with what exists and shown with the assistants people actually use. The one thing
 * that is not out yet, the published MCP package, is stated next to the claim.
 */
export function AiNative() {
  return (
    <Band tone="light" labelledBy="ai-h">
      <div className={wrap}>
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <RevealHeading id="ai-h" as="h2" mode="line" className="t-1 text-ink" parts={[["Built for AI agents, too.", ""], ["Your assistant can add payments, and check them.", "text-ink-4"]]} />
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-md text-lg text-ink-2">Describe what you want in plain English. The assistant works inside the project you already have, with the real order total, and tells you whether the four checks passed.</p>
            </Reveal>
            <ul className="mt-9 space-y-5">
              {FEATURES.map((f, i) => (
                <Reveal as="li" key={f.title} delay={i * 0.06}>
                  <div className="flex gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-sunk text-ink"><f.icon className="size-5" aria-hidden /></span>
                    <div><h3 className="text-[1.0625rem] font-medium tracking-[-0.02em] text-ink">{f.title}</h3><p className="mt-0.5 max-w-md text-[0.9375rem] text-ink-3">{f.text}</p></div>
                  </div>
                </Reveal>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/build-with-ai" className={`${buttonStyles({ variant: "primary", size: "lg" })} h-12 px-5`}>Add it with your AI assistant<ArrowRight className="size-4" aria-hidden /></Link>
            </div>
            <p className="mt-5 max-w-md overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-sunk px-3.5 py-2.5 font-mono text-xs text-ink-2">claude mcp add --transport http plinth {MCP_URL} --header &quot;Authorization: Bearer sk_…&quot;</p>
          </div>
          <Reveal delay={0.1}><Session /></Reveal>
        </div>

        <div className="mt-20 sm:mt-24">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-lg text-lg font-medium tracking-[-0.02em] text-ink">Any assistant that can use an MCP server <span className="text-ink-4">or read /llms.txt.</span></p>
            <p className="text-xs text-ink-3">Marks belong to their owners and show compatibility, not partnership.</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {AGENTS.map((a) => (
              <li key={a.name} className="flex h-16 items-center gap-3 rounded-card border border-line bg-raised px-4 shadow-low">
                <AgentMark {...a} />
                <span className="text-[0.9375rem] font-medium text-ink">{a.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Band>
  );
}
