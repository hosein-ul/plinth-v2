import Link from "next/link";
import { ArrowRight, Bot, Check, Copy, Link2, Sparkles } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";


import { CHECKOUT_HOST } from "@/lib/config";
const tile = "group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-line bg-raised p-6 shadow-low transition-[box-shadow,transform] duration-[var(--duration-slow)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-float sm:p-8";
const cta = "inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink";
const arrow = "size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1";

/** The two ways to take money, told for chat: a bot that asks for the right price every time, or one fixed-price link. */
export function ChatPaths() {
  return (
    <Band tone="light" labelledBy="paths-h">
      <div className={wrap}>
        <RevealHeading id="paths-h" as="h2" mode="line" className="t-1 max-w-3xl text-ink" parts={[["Two ways to get paid.", ""], ["Automatic in your bot, or a link you send.", "text-ink-4"]]} />
        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Reveal className="min-w-0">
            <div className={tile}>
              <span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><Bot className="size-5" aria-hidden /></span>
              <h3 className="mt-6 text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-ink">Take payments inside your Mini App, bot or shop.</h3>
              <p className="mt-2 max-w-lg text-[0.9375rem] text-ink-2">When someone checks out, your app asks Plinth for a payment at the order total and shows a Pay button. Nothing to set up per product, and no links to make by hand. Your AI assistant can add it to the project you already run.</p>

              <div className="mt-7 grid items-center gap-3 rounded-[1.25rem] bg-sunk p-4 sm:grid-cols-[1fr_auto_1fr] sm:p-5">
                <div className="min-w-0 space-y-2">
                  <div className="w-fit rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm font-medium text-on-ink">/buy</div>
                  <div className="rounded-2xl rounded-bl-md border border-line bg-raised p-3 shadow-low">
                    <p className="text-sm font-medium text-ink">Order #1042</p>
                    <div className="mt-2 grid h-9 place-items-center rounded-lg bg-ink text-sm font-medium text-on-ink">Pay 25 USDC</div>
                  </div>
                </div>
                <ArrowRight className="mx-auto size-4 rotate-90 text-ink-4 sm:rotate-0" aria-hidden />
                <div className="min-w-0 rounded-2xl border border-line bg-raised p-3.5 shadow-low">
                  <p className="text-xs text-ink-3">Your app, a moment later</p>
                  <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-ink"><span className="grid size-4 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-2.5" strokeWidth={4} aria-hidden /></span>Order confirmed.</p>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-7">
                <Link href="/build-with-ai" className={cta}><Sparkles className="size-4 text-ink-3" aria-hidden />Add it with your AI assistant<ArrowRight className={arrow} aria-hidden /></Link>
                <Link href="/developers" className="text-[0.9375rem] font-medium text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">Read the API docs</Link>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="min-w-0">
            <div className={tile}>
              <span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><Link2 className="size-5" aria-hidden /></span>
              <h3 className="mt-6 text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-ink">Or paste a link. One price, no code.</h3>
              <p className="mt-2 text-[0.9375rem] text-ink-2">For one service, one course or a single sale. Make a link in the dashboard and drop it into a message. Nothing to install.</p>
              <div className="mt-7 rounded-[1.25rem] bg-sunk p-4 sm:p-5">
                <div className="rounded-2xl border border-line bg-raised p-4 shadow-low">
                  <div className="flex items-baseline justify-between"><p className="text-xs text-ink-3">Payment link</p><p className="tnum text-xl font-medium tracking-[-0.03em]">25<span className="text-ink-4">.00</span> <span className="text-xs font-medium text-ink-3">USDC</span></p></div>
                  <p className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-sunk px-3 py-2 font-mono text-[0.8125rem] text-ink"><span className="truncate">{CHECKOUT_HOST}/l/…</span><Copy className="size-3.5 shrink-0 text-ink-3" aria-hidden /></p>
                </div>
              </div>
              <Link href="/signup" className={`${cta} mt-auto pt-7`}>Create a link<ArrowRight className={arrow} aria-hidden /></Link>
            </div>
          </Reveal>
        </div>
      </div>
    </Band>
  );
}
