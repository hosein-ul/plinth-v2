import Link from "next/link";
import { ArrowRight, FlaskConical, Lock, ShieldAlert } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { CollageScene } from "@/components/marketing/hero-visuals";
import { HeroVideo } from "@/components/marketing/hero-video";
import { DEMO_HREF } from "@/lib/routes";
import { wrap } from "@/components/marketing/parts";

const TRUST = [[Lock, "Non-custodial by construction"], [FlaskConical, "Live on Arc"], [ShieldAlert, "Audited contracts"]] as const;

/**
 * The landing hero. The copy is plain server-rendered text, visible from the first paint; the only motion on it is a CSS reveal on
 * the second line of the headline, which needs no JavaScript, so a slow connection never shows an empty hero. Behind it a looping glass-wave video, played slowly; beside it the checkout, on a desktop browser and on an iPhone.
 */
export function Hero() {
  const second = "Straight to your own vault.".split(" ");
  return (
    <section className="relative isolate overflow-clip bg-white">
      <HeroVideo />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-b from-transparent to-ground" />
      <div className={`${wrap} relative z-[1] grid items-center gap-x-8 gap-y-12 pb-20 pt-14 xl:grid-cols-[minmax(0,31rem)_minmax(0,1fr)] xl:pb-28 xl:pt-20`}>
        <div className="relative z-10">
          <h1 className="t-display text-[clamp(2.75rem,4.5vw,4.25rem)] text-ink">
            <span className="block">Get paid in USDC.</span>
            <span className="block text-ink-4">
              {second.map((w, i) => (
                <span key={w + i} className="hero-line-in inline-block" style={{ animation: `hero-line-in 0.9s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.12}s both` }}>{w}{i < second.length - 1 ? " " : ""}</span>
              ))}
            </span>
          </h1>
          <p className="mt-6 max-w-[29rem] text-lg text-ink-2">
            Every invoice gets an address that can only pay you. Nobody holds the money in between, and your customer needs no gas.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={`${buttonStyles({ variant: "primary", size: "lg" })} h-12 px-5`}>Create a test invoice<ArrowRight className="size-4" aria-hidden /></Link>
            <Link href={DEMO_HREF} className="inline-flex h-12 items-center rounded-ctl border border-line-strong bg-raised px-5 text-[0.9375rem] font-medium text-ink shadow-ctl transition-colors hover:bg-wash">Open the live demo</Link>
          </div>
          <ul className="mt-10 grid max-w-[29rem] gap-3 text-sm text-ink-2 sm:grid-cols-3 sm:gap-4">
            {TRUST.map(([I, t]) => <li key={t} className="flex items-start gap-2"><I className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />{t}</li>)}
          </ul>
        </div>
        <div className="relative z-10"><div className="mx-auto w-full max-w-[38rem] xl:max-w-none"><CollageScene /></div></div>
      </div>
    </section>
  );
}
