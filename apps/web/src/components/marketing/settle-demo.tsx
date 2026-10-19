"use client";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, useScroll, useTransform } from "motion/react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { SettlementRail, type Station } from "@/components/rail";
import { ChainBadge, TokenIcon } from "@/components/brand";
import { Connector } from "@/components/marketing/motion/connector";
import { Tilt } from "@/components/marketing/motion/tilt";

/** Illustrative placeholder, never a real address. */
const PLACEHOLDER = "0x8b2c9f41e07d";
const STEPS: { key: string; label: string; note: string }[] = [
  { key: "d", label: "Detected", note: "transfer seen" },
  { key: "v", label: "Verified", note: "official USDC" },
  { key: "f", label: "Final", note: "received" },
  { key: "s", label: "Swept", note: "sweep()" },
  { key: "t", label: "In your vault", note: "settled" },
];

/** Drives the illustrative sequence (0..5). Shows the finished state under reduced motion. */
function useSettling() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(5); return; }
    let step = 0, timer: ReturnType<typeof setTimeout>;
    const tick = () => { setN(step); const wait = step === 5 ? 3400 : step === 0 ? 1500 : 1000; step = step === 5 ? 0 : step + 1; timer = setTimeout(tick, wait); };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return n;
}

function CheckoutCard({ n, className }: { n: number; className?: string }) {
  const stations: Station[] = STEPS.map((s, i) => ({ key: s.key, label: s.label, state: i < n ? "done" : i === n ? "live" : "todo", note: i < n ? s.note : undefined }));
  return (
    <div className={cn("card p-[18px]", className)}>
      <div className="flex items-center justify-between text-xs text-ink-3"><span>Checkout</span><ChainBadge id="arc-mainnet" size={16} className="text-xs" /></div>
      <div className="tnum mt-3 flex items-center gap-2.5">
        <TokenIcon symbol="USDC" size={30} />
        <span className="text-[2.25rem] font-medium leading-none tracking-[-0.045em] text-ink">25<span className="text-ink-4">.00</span></span>
        <span className="mt-2 text-sm font-medium text-ink-3">USDC</span>
      </div>
      <div className="my-3.5 grid grid-cols-2 rounded-[11px] bg-sunk p-[3px] text-center text-[0.8125rem] font-medium text-ink-3">
        <span className="rounded-[8px] py-1.5">Pay with wallet</span>
        <span className="rounded-[8px] bg-raised py-1.5 text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12)]">Send to address</span>
      </div>
      <div className="grid grid-cols-[88px_1fr] items-center gap-3">
        <div className="rounded-[10px] border border-line bg-raised p-1.5"><QRCodeSVG value="plinth-illustration" size={74} level="M" bgColor="transparent" fgColor="#0c1220" /></div>
        <div className="min-w-0">
          <p className="text-2xs text-ink-3">Address for this invoice only</p>
          <p className="mt-1 font-mono text-[0.75rem] leading-[1.6] text-ink-2"><span className="font-medium text-ink">0x8b2c</span>…<span className="font-medium text-ink">e07d</span></p>
        </div>
      </div>
      <div className="mt-3.5 border-t border-line pt-2.5"><SettlementRail stations={stations} layout="list" /></div>
    </div>
  );
}

function VaultCard({ n, className }: { n: number; className?: string }) {
  const done = n >= 5;
  return (
    <div className={cn("relative overflow-hidden rounded-card border border-white/15 bg-ink-rise p-4 text-on-ink shadow-float", className)}>
      <div className="flex items-center justify-between text-xs text-white/55"><span>Your vault</span><Lock className="size-3.5" aria-hidden /></div>
      <p className="mt-1 text-sm text-white/80">Only your wallet can withdraw.</p>
      <div className="mt-4 flex items-center gap-2.5 rounded-[10px] bg-white/[0.06] px-3 py-2.5">
        <TokenIcon symbol="USDC" size={22} />
        <span className="text-sm font-medium">USDC</span>
        <span className={cn("ml-auto text-[0.8125rem] transition-colors duration-[var(--duration-slow)]", done ? "font-medium text-[#6ee7b7]" : "text-white/45")}>{done ? "+25.00 settled" : "waiting for sweep"}</span>
      </div>
      <div className={cn("mt-2.5 flex items-center gap-2 font-mono text-2xs text-white/60 transition-[opacity,translate] duration-[var(--duration-slow)] ease-[var(--ease-out)]", done ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0")}>
        <span className="grid size-4 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-2.5" strokeWidth={3.5} aria-hidden /></span>
        payment.completed signed, delivered
      </div>
      {done && <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-16 rounded-full border border-signal/60 motion-reduce:hidden" style={{ animation: "ring-out 1.6s var(--ease-out) 1" }} />}
    </div>
  );
}

/**
 * The hero image: the checkout card and the merchant's vault joined by one line, running the settling sequence.
 * An illustration of the product's states. It does not talk to the network; amounts and addresses are placeholders.
 */
export function HeroStage({ className }: { className?: string }) {
  const n = useSettling();
  const reducedMotion = useReduced();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const reduce = reducedMotion || !wide;
  const { scrollY } = useScroll();
  const yA = useTransform(scrollY, [0, 700], [0, 22]);
  const yB = useTransform(scrollY, [0, 700], [0, -38]);
  return (
    <figure className={cn("relative sm:h-[33.5rem] sm:w-[40rem]", className)} aria-label="Illustration of a payment settling into a vault">
      <motion.div className="relative z-20 w-full max-w-[22rem] sm:absolute sm:left-0 sm:top-0 sm:w-[20.5rem]" style={reduce ? undefined : { y: yA }}>
        <Tilt max={4} lift={4}><CheckoutCard n={n} /></Tilt>
      </motion.div>
      <Connector dark d="M0,0 C96,0 176,36 176,150" w={176} h={150} className="absolute left-[20.5rem] top-[10rem] z-10 hidden h-[150px] w-[176px] sm:block" seconds={2.6} />
      <span aria-hidden className="absolute left-[calc(20.5rem+78px)] top-[calc(10rem+6px)] z-10 hidden rounded-md bg-raised px-1.5 py-0.5 font-mono text-2xs text-ink-2 shadow-low sm:block">sweep()</span>
      <span aria-hidden className="mx-auto my-3 block h-8 w-px border-l border-dashed border-line-strong sm:hidden" />
      <motion.div className="relative z-20 w-full max-w-[22rem] sm:absolute sm:bottom-6 sm:right-0 sm:w-[17rem]" style={reduce ? undefined : { y: yB }}>
        <Tilt max={5} lift={4}><VaultCard n={n} /></Tilt>
      </motion.div>
      <figcaption className="mt-3 inline-block rounded-full bg-raised/90 px-2.5 py-1 text-2xs text-ink-3 shadow-low sm:absolute sm:bottom-0 sm:left-0 sm:mt-0">Illustration with sample amounts and addresses.</figcaption>
    </figure>
  );
}

/** Single checkout card used beside the sign-in and sign-up forms. */
export function SettleDemo({ className, compact }: { className?: string; compact?: boolean }) {
  const n = useSettling();
  if (compact) {
    return (
      <div className={cn("relative w-[20.5rem] max-w-full", className)} aria-hidden>
        <CheckoutCard n={n} />
        <p className="mt-3 text-2xs text-ink-4">Illustration with sample amounts and addresses.</p>
      </div>
    );
  }
  return <HeroStage className={className} />;
}

/**
 * The oversized arch that frames the hero visual. It stands on the dark band below it (same ink, so the two read as one mass)
 * and morphs as the page scrolls: a full semicircle top relaxes into one huge sweep against a small notch.
 * A hairline echo of the arch drifts at a different speed behind it.
 */
export function HeroArch({ className }: { className?: string }) {
  const reduce = useReduced();
  const { scrollY } = useScroll();
  const radius = useTransform(scrollY, [0, 560], ["320px 320px 0px 0px", "320px 36px 0px 0px"]);
  const y = useTransform(scrollY, [0, 800], [0, 90]);
  const echoY = useTransform(scrollY, [0, 800], [0, -60]);
  const echoRadius = useTransform(scrollY, [0, 560], ["320px 320px 0px 0px", "36px 320px 0px 0px"]);
  return (
    <div aria-hidden className={cn("pointer-events-none absolute bottom-0 right-[-8vw] top-[6rem] z-0 w-[clamp(19rem,46vw,42rem)] sm:right-[-3vw] max-xl:top-auto max-xl:h-[50%] max-xl:w-[92%] max-xl:max-w-[36rem]", className)}>
      <motion.div className="mask-fade-b absolute -left-[clamp(1.5rem,3vw,3rem)] inset-y-0 right-[clamp(1.5rem,3vw,3rem)] border border-line-strong" style={reduce ? { borderRadius: "320px 36px 0 0" } : { borderRadius: echoRadius, y: echoY }} />
      <motion.div className="surface-ink grid-ink absolute inset-0 overflow-hidden [--grid-x:30%] [--grid-y:20%]" style={reduce ? { borderRadius: "320px 36px 0 0" } : { borderRadius: radius, y }}>
        <div className="tint-mint-tr absolute inset-0" />
      </motion.div>
    </div>
  );
}
