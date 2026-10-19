import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Check } from "lucide-react";
import { WalletFrame } from "@/components/marketing/checkout-frames";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { Band } from "@/components/marketing/band";
import { Magnetic } from "@/components/marketing/motion/magnetic";
import { Parallax } from "@/components/marketing/motion/parallax";
import { TextAnimate } from "@/components/magicui/text-animate";
import { Reveal } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { buttonStyles } from "@/components/ui/button";
import { DEMO_HREF } from "@/lib/routes";
import { cn } from "@/lib/cn";

/** The last band is dark and runs straight into the footer: one continuous mass, with a ring that crosses the join. */
export function FinalCta() {
  return (
    <Band tone="dark" shape="leaf-b" grid={false} labelledBy="cta-h" backdrop={<> <ShaderField preset="mist" colors={SHADER_COLORS["mist-dark"]!} seed={9} /> <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(10_16_25/0.8),rgb(10_16_25/0.3)_58%,transparent)]" /> </>}>
      <div className={wrap}>
        <div className="grid gap-12 lg:gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-center">
          <div>
            <h2 id="cta-h" className="t-display text-[clamp(2.75rem,7vw,6.25rem)] text-on-ink">
              <TextAnimate as="span" by="character" animation="blurInUp" duration={0.6} once className="block">Take a payment</TextAnimate>
              <TextAnimate as="span" by="character" animation="blurInUp" duration={0.6} delay={0.45} once className="block text-white/45" aria-hidden>through it.</TextAnimate>
            </h2>
            <Reveal delay={0.3}>
              <p className="mt-6 max-w-md text-lg text-white/65">Create an account, make a vault and take your first payment on Arc. It takes minutes.</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Magnetic><Link href="/signup" className={cn(buttonStyles({ variant: "secondary", size: "lg" }), "h-12 border-transparent px-6")}>Create a free account<ArrowRight className="size-4" aria-hidden /></Link></Magnetic>
                <Link href={DEMO_HREF} className="inline-flex h-12 items-center rounded-ctl border border-white/20 px-5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10">Open the live demo</Link>
              </div>
            </Reveal>
          </div>
          <Parallax distance={26}>
            <div className="relative mx-auto w-full max-w-[21rem] pb-10">
              <div className="origin-bottom-left -rotate-[3deg]"><WalletFrame /></div>
              <div className="absolute -bottom-2 -left-1 w-[16rem] sm:-left-14 sm:w-[17.5rem] rounded-card border border-white/12 bg-ink-lift/95 p-4 shadow-float">
                <p className="flex items-center gap-2 text-xs font-medium text-white"><span className="grid size-5 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-3" strokeWidth={3.5} aria-hidden /></span>Webhook delivered</p>
                <p className="mt-2 font-mono text-2xs leading-5 text-white/60">payment.completed<br />Plinth-Signature: t=…,v1=…<br /><span className="text-[#6ee7b7]">200 OK</span></p>
              </div>
            </div>
          </Parallax>
        </div>
      </div>
    </Band>
  );
}
