"use client";
import { motion } from "motion/react";
import { Fingerprint, QrCode } from "lucide-react";
import { AddressFrame, WalletFrame } from "@/components/marketing/checkout-frames";
import { Band } from "@/components/marketing/band";
import { Parallax } from "@/components/marketing/motion/parallax";
import { RevealHeading, Reveal } from "@/components/marketing/motion/reveal";
import { Tilt } from "@/components/marketing/motion/tilt";
import { FadeSwap, WipeStack, useWipe } from "@/components/marketing/motion/wipe-stack";
import { wrap } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

type Flow = "wallet" | "address";
const ORDER: Flow[] = ["wallet", "address"];

const FLOWS: Record<Flow, { title: string; lead: string; rows: [string, string][] }> = {
  wallet: {
    title: "Pay with wallet",
    lead: "One signature, no gas for the customer.",
    rows: [
      ["Customer needs", "A browser or mobile wallet holding USDC"],
      ["Network fee", "None for them where the network's USDC supports signed authorisations. The relayer pays."],
      ["How it works", "They sign one typed message to our router and we relay it on-chain."],
      ["When it is not offered", "If the network or wallet cannot do it, the checkout says so and offers the address instead."],
    ],
  },
  address: {
    title: "Send to address",
    lead: "Any wallet, any exchange.",
    rows: [
      ["Customer needs", "Anything that can send USDC on the right network"],
      ["Network fee", "Paid by the sender, as with any transfer. On Arc the fee is paid in USDC."],
      ["How it works", "They send to the invoice's own address. We detect it, verify it, then sweep."],
      ["When it is not offered", "Always offered. It needs nothing from the website or the wallet."],
    ],
  },
};

export function TwoFlows() {
  const left = useWipe(2);
  const flow = ORDER[left.cur]!;
  const pick = (i: number, e: React.MouseEvent) => { left.go(i, e); };

  const frames = [<Tilt key="w" max={4} lift={4}><WalletFrame /></Tilt>, <Tilt key="a" max={4} lift={4}><AddressFrame /></Tilt>];
  const texts = ORDER.map((k) => {
    const f = FLOWS[k];
    return (
      <div key={k}>
        <h3 className="text-[1.625rem] font-medium tracking-[-0.03em] text-on-ink">{f.lead}</h3>
        <dl className="mt-5 divide-y divide-white/10">
          {f.rows.map(([a, b]) => (
            <div key={a} className="grid gap-1 py-3.5 sm:grid-cols-[9.5rem_1fr] sm:gap-4">
              <dt className="text-sm text-white/50">{a}</dt>
              <dd className="text-sm text-white/90">{b}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  });

  return (
    <Band tone="dark" labelledBy="flows-h" className="[--grid-x:25%] [--grid-y:55%]">
      <div aria-hidden className="tint-mint-bl pointer-events-none absolute inset-x-0 bottom-0 h-[30rem]" />
      <div className={wrap}>
        <RevealHeading id="flows-h" as="h2" mode="line" className="t-1 max-w-2xl text-on-ink" parts={[["Two ways to pay.", "text-on-ink"], ["One payment engine behind both.", "text-white/45"]]} />
        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-center lg:gap-16">
          <Reveal>
            <Parallax distance={20}>
              <figure className="relative mx-auto w-full max-w-[34rem]">
                <div className="dots-ink relative isolate overflow-hidden rounded-[clamp(1.5rem,3vw,2.25rem)] border border-white/10 bg-ink-lift px-5 pb-8 pt-8 [--grid-x:50%] [--grid-y:20%] sm:px-10">
                  <div className="relative mx-auto max-w-[21rem]">
                    <WipeStack wipe={left} panels={frames} />
                  </div>
                  <figcaption className="relative mt-8 text-center text-2xs text-white/45">Illustration of the hosted checkout, with sample amounts and addresses.</figcaption>
                </div>
              </figure>
            </Parallax>
          </Reveal>

          <div>
            <div role="tablist" aria-label="Payment method" className="relative inline-grid grid-cols-2 rounded-[13px] bg-white/10 p-1">
              {ORDER.map((k, i) => {
                const on = k === flow;
                const Icon = k === "wallet" ? Fingerprint : QrCode;
                return (
                  <button key={k} role="tab" type="button" aria-selected={on} onClick={(e) => pick(i, e)} className={cn("relative z-10 inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-colors duration-[var(--duration-fast)]", on ? "text-ink" : "text-white/65 hover:text-white")}>
                    {on && <motion.span layoutId="flow-thumb" className="absolute inset-0 -z-10 rounded-[10px] bg-raised shadow-[0_1px_2px_rgb(0_0_0/0.3)]" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                    <Icon className="size-4" aria-hidden />{FLOWS[k].title}
                  </button>
                );
              })}
            </div>
            <div className="mt-8">
              <FadeSwap index={left.cur} panels={texts} />
            </div>
          </div>
        </div>
      </div>
    </Band>
  );
}
