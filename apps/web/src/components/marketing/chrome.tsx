import { OffscreenPause } from "@/components/marketing/offscreen-pause";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/brand";
import { buttonStyles } from "@/components/ui/button";
import { FooterMark } from "@/components/marketing/footer-mark";
import { DEMO_HREF } from "@/lib/routes";
import { cn } from "@/lib/cn";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";

import { SiteHeader } from "@/components/marketing/site-header";
export { SiteHeader };

const COLS: { title: string; links: [string, string][] }[] = [
  { title: "Product", links: [["Live demo", DEMO_HREF], ["Use cases", "/use-cases"], ["Integrations", "/integrations"], ["Networks and assets", "/networks"], ["Pricing", "/pricing"]] },
  { title: "Developers", links: [["Quickstart", "/developers#quickstart"], ["API reference", "/developers#api"], ["Webhooks", "/developers#webhooks"], ["Payment states", "/developers#states"], ["Go live", "/developers#sandbox"], ["Build with AI", "/build-with-ai"], ["MCP server", "/build-with-ai#ai-connect"], ["AI-readable docs", "/llms.txt"]] },
  { title: "Trust", links: [["Security model", "/security"], ["System status", "/status"], ["FAQ", "/faq"], ["Brand", "/brand"], ["Contact", "/contact"]] },
  { title: "Legal", links: [["Terms of service", "/legal/terms"], ["Privacy policy", "/legal/privacy"], ["Risk disclosure", "/legal/risk-disclosure"]] },
];

export function SiteFooter() {
  return (
    <footer className="site-footer surface-ink grid-ink island relative isolate mx-3 mb-3 mt-6 overflow-clip sm:mx-5 [--grid-x:35%] [--grid-y:0%]">
      <div aria-hidden className="tint-mint-tr pointer-events-none absolute inset-x-0 top-0 z-0 h-[28rem]" />
      
      <div className="relative z-[1] mx-auto max-w-[75rem]">
        <div className="grid gap-12 px-5 pb-12 pt-[clamp(4rem,9vw,7rem)] sm:px-8 lg:grid-cols-[1.3fr_2.7fr]">
          <div>
            <Logo tone="dark" size={26} />
            <p className="mt-5 max-w-xs text-sm text-white/60">Non-custodial USDC payments. We watch, verify and relay. You hold the only key to your vault.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/signup" className={cn(buttonStyles({ variant: "secondary", size: "md" }), "border-transparent")}>Create account</Link>
              <Link href="/login" className="inline-flex h-9 items-center rounded-ctl px-3.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white">Sign in</Link>
            </div>
            <Link href="/status" className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white">
              <span aria-hidden className="size-1.5 rounded-full bg-signal" />System status<ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {COLS.map((c) => <FooterCol key={c.title} title={c.title} links={c.links} />)}
          </div>
        </div>
        <div className="grid gap-4 border-t border-white/10 px-5 py-6 text-xs leading-relaxed text-white/55 sm:px-8 lg:grid-cols-2 lg:gap-12">
          <p><span className="font-medium text-white/80">Risk.</span> Plinth is live on Arc mainnet. The smart contracts have been through a security audit. Each further network opens only after its own on-chain check and an explicit operator approval. Digital assets can lose value and transfers cannot be reversed.</p>
          <p><span className="font-medium text-white/80">Not advice.</span> Nothing on this site is investment, legal, tax or financial advice. Plinth is software that coordinates payments between wallets its users control; it is not a bank and does not hold customer funds.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-xs text-white/45 sm:px-8">
          <span>Plinth. Live on Arc mainnet; audited contracts.</span>
          <span className="inline-flex flex-wrap items-center gap-4">
            <a href="https://x.com/andy1eth" target="_blank" rel="noopener noreferrer" aria-label="Founder on X, @andy1eth" className="inline-flex items-center gap-1.5 hover:text-white"><svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>Founder <span className="text-white/70">@andy1eth</span></a>
            <Link href="/legal/terms" className="hover:text-white">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/legal/risk-disclosure" className="hover:text-white">Risk</Link>
          </span>
        </div>
        <FooterMark />
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-medium text-white/45">{title}</p>
      <ul className="mt-3.5 space-y-2.5">{links.map(([l, h]) => <li key={l}><Link href={h} className="text-sm text-white/80 transition-colors hover:text-white">{l}</Link></li>)}</ul>
    </div>
  );
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <OffscreenPause />
    </>
  );
}

/** Inner-page opening: a two-tone headline on the daylight background. `eyebrow` is kept for callers and rendered as the muted clause's context. */
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden bg-daylight dotgrid [--dot-x:88%] [--dot-y:30%]">
      <div aria-hidden className="absolute inset-0 -z-10 opacity-70 [mask-image:linear-gradient(180deg,#000_30%,transparent)]"><ShaderField preset="mesh" colors={SHADER_COLORS["mesh-light"]!} spotlight={false} speed={0.6} seed={5} /></div>
      <div className="mx-auto max-w-[75rem] px-5 pb-14 pt-16 sm:px-8 sm:pt-24">
        <Reveal y={10}><p className="text-sm font-medium text-ink-3">{eyebrow}</p></Reveal>
        <RevealHeading as="h1" mode="word" immediate className="t-1 mt-3 max-w-3xl text-ink" parts={[[title, ""]]} />
        {children && <Reveal delay={0.25} y={14}><div className="mt-5 max-w-2xl text-lg text-ink-2">{children}</div></Reveal>}
      </div>
    </div>
  );
}
