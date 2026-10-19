import Link from "next/link";
import { Chip } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { TextAnimate } from "@/components/magicui/text-animate";
import { Reveal } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";

const FACTS: { chip: [tone: "info" | "warn" | "neutral" | "ok", label: string]; title: string; text: string }[] = [
  { chip: ["ok", "Built end to end"], title: "The whole payment flow is in place", text: "Create a payment, pay by wallet or by address, settle to a vault, receive a signed webhook. Tested end to end on a local chain." },
  { chip: ["ok", "Non-custodial"], title: "We never hold your money", text: "Funds go from the customer's invoice address straight to a vault that only your wallet can withdraw from." },
  { chip: ["info", "Arc first"], title: "Live on Arc mainnet", text: "USDC and EURC settle on Arc today. Other mainnets open one by one as their contracts are deployed and byte-verified." },
  { chip: ["neutral", "Audit gate"], title: "Mainnet waits for an independent audit", text: "An outside review of the contracts is a launch requirement, not an afterthought." },
  { chip: ["ok", "Documented"], title: "A versioned API you can read", text: "REST under /v1 with an OpenAPI 3.1 document, idempotent requests, and signed webhooks you can replay." },
];

export function WhereWeStand() {
  return (
    <Band tone="dark" labelledBy="stand-h" className="[--grid-x:15%] [--grid-y:35%]" backdrop={<><div className="absolute inset-0 opacity-80 [mask-image:linear-gradient(180deg,transparent,#000_30%,#000)]"><ShaderField preset="mesh" colors={SHADER_COLORS["mesh-dark"]!} spotlight={false} seed={5} /></div></>}>
      <div className={wrap}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 id="stand-h" className="t-1 text-on-ink">
              <TextAnimate as="span" by="word" animation="slideUp" duration={0.5} once className="block">Where Plinth stands.</TextAnimate>
              <TextAnimate as="span" by="word" animation="slideUp" duration={0.5} delay={0.3} once className="block text-white/45" aria-hidden>Built carefully, going live deliberately.</TextAnimate>
            </h2>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-md text-lg text-white/65">Live on Arc today. This is what is already true, and what stands between here and production.</p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] font-medium">
                {([["Security model", "/security"], ["Live status", "/status"], ["Pricing", "/pricing"], ["Risk disclosure", "/legal/risk-disclosure"]] as const).map(([l, h]) => (
                  <Link key={h} href={h} className="text-on-ink underline decoration-white/30 underline-offset-4 hover:decoration-white">{l}</Link>
                ))}
              </div>
            </Reveal>
          </div>
          <ul className="border-b border-white/10">
            {FACTS.map((f, i) => (
              <ClipReveal as="li" key={f.title} variant="inset-x" delay={i * 0.08} duration={1}>
                <div className="grid gap-3 border-t border-white/10 py-6 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-6">
                  <div className="sm:pt-0.5"><Chip tone={f.chip[0]}>{f.chip[1]}</Chip></div>
                  <div><h3 className="text-[1.125rem] font-medium tracking-[-0.02em] text-on-ink">{f.title}</h3><p className="mt-1 text-[0.9375rem] text-white/60">{f.text}</p></div>
                </div>
              </ClipReveal>
            ))}
          </ul>
        </div>
      </div>
    </Band>
  );
}
