"use client";
import { useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { Band } from "@/components/marketing/band";
import { CoinFlight } from "@/components/marketing/motion/coin-flight";
import { TunnelField } from "@/components/marketing/motion/tunnel-field";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { useCompact } from "@/components/marketing/motion/use-compact";
import { SweepIllustration } from "@/components/marketing/sweep-illustration";
import { WordScrub } from "@/components/marketing/motion/word-scrub";
import { wrap } from "@/components/marketing/parts";

const TEXT =
  "Every invoice gets its own address. When USDC arrives, a relayer sweeps it to a vault that only your wallet can withdraw from. Nobody holds the money in between, and nobody can send it anywhere else.";

const STAGES: [title: string, note: string][] = [
  ["An address, derived", "Computed for one invoice. Nothing is deployed."],
  ["USDC arrives", "Read from the chain and checked against the official token."],
  ["A sweep, no arguments", "One call. The destination is fixed in the contract."],
  ["A vault only you control", "Your wallet is the single authority."],
];

/**
 * The statement island. One sentence lights up word by word as you scroll through a pinned stage, and the four stages of an
 * invoice light up beside it on the same scroll value. Text and list are the same story; nothing decorative.
 */
export function Statement() {
  const outer = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const compact = useCompact();
  const [stage, setStage] = useState(0);
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start 55%", "end 85%"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setStage(Math.min(3, Math.max(0, Math.floor(v * 4)))));
    const active = reduce ? 3 : stage;

  return (
    <Band tone="dark" labelledBy="state-h" className="[--grid-x:85%] [--grid-y:40%]" backdrop={<><TunnelField progress={scrollYProgress} className="absolute inset-0 size-full" />{!reduce && !compact && <div aria-hidden className="pointer-events-none absolute inset-0"><div className="sticky top-0 h-dvh overflow-hidden"><CoinFlight progress={scrollYProgress} src="/brand/usdc-coin.webp" /></div></div>}<div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(10_16_25/0.7),rgb(10_16_25/0.2)_60%,transparent)]" /></>}>
      <div className={wrap}>
        <h2 id="state-h" className="sr-only">Nobody holds the money in between</h2>
        <div ref={outer} className="lg:h-[220dvh]">
          <div className="lg:sticky lg:top-24 lg:flex lg:h-[calc(100dvh-8rem)] lg:items-center">
            <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14">
              <div>
                <p className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-white/55"><span aria-hidden className="size-1.5 rounded-full bg-signal" />The whole idea, in one breath</p>
                <WordScrub
                  text={TEXT}
                  marks={["address", "wallet", "between"]}
                  progress={scrollYProgress}
                  className="text-[clamp(1.75rem,3.3vw,3.125rem)] font-medium leading-[1.16] tracking-[-0.035em] text-on-ink"
                />
              </div>

              <div className="mx-auto w-full max-w-[34rem]">
                <SweepIllustration progress={scrollYProgress} />
                <p className="mt-4 flex items-center justify-center gap-3 text-sm text-white/70" aria-live="polite">
                  <span className="tnum font-mono text-2xs text-white/40">0{active + 1} / 04</span>
                  <span>{STAGES[active]![0]}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Band>
  );
}
