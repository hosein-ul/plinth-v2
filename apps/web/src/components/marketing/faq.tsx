"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

const QA: [string, string][] = [
  ["Can I use it inside a Mini App?", "The checkout is a normal web page, so a Mini App can open it, and your server is told by a signed message when it is paid. It has not been tuned for Mini App themes yet, and there is no dedicated Mini App component today."],
  ["Does Telegram allow this?", "Telegram sets its own rules for what may be sold inside Mini Apps, especially digital goods on phone app stores. Check the current rules for your case. Plinth links also work in plain chat messages and in an ordinary browser."],
  ["Who holds the money?", "Nobody in between. Each invoice has its own address, and funds are swept from it into a vault that only your wallet can withdraw from. Plinth runs the relayer that pays the network fee for the sweep, and that relayer cannot choose a destination or withdraw."],
  ["Does my customer need gas?", "Not with Pay with wallet, where the network's token supports signed authorisations: they sign once and our relayer pays. With Send to address they pay the normal network fee for the transfer themselves; on Arc that fee is paid in USDC."],
  ["When is it safe to fulfil an order?", "When you receive the signed payment.confirmed webhook. It fires only after the transfer meets the network's finality rule, which differs per network. Never fulfil from a redirect or a client-side callback."],
  ["What if a customer underpays, overpays or pays late?", "Each case has its own state and its own webhook: underpaid, overpaid and late payment. Nothing is silently rounded or guessed. Several transfers to the same invoice are added up."],
  ["What happens if they send the wrong token?", "Only the official token the payment was created in counts: USDC, or EURC on Arc. Anything else sent to the address is recorded as an invalid asset and is not credited."],
  ["Are the contracts audited? Is this live on mainnet?", "Live on Arc mainnet. Yes. The security audit covered 87 tests, 20,000-run fuzzing, static analysis with no high or medium findings, and fork tests against the real USDC. Every other network opens only after its own on-chain check and an explicit approval."],
  ["What does it cost?", "0.20% of each payment, taken inside the settlement transaction, with a 1% cap fixed in the contract. The pricing page has the details."],
  ["How do refunds work?", "A refund is a transfer you sign from the account that received the funds, your vault or your payout wallet. It is marked complete only when that transfer is verified on-chain. The fee is not refunded."],
  ["Is this a Telegram product?", "No. Plinth is independent and is not affiliated with or endorsed by Telegram. The Telegram name and mark belong to their owner and are used here only to say where it can be used."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Band tone="light" labelledBy="faq-h" className="grid-paper [--grid-x:15%] [--grid-y:20%]">
      <div className={wrap}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <RevealHeading id="faq-h" as="h2" mode="line" className="t-1 text-ink" parts={[["Questions", ""], ["we would ask first.", "text-ink-4"]]} />
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-sm text-[0.9375rem] text-ink-3">More in the <Link href="/faq" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">full FAQ</Link>, or ask us directly through <Link href="/contact" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">contact</Link>.</p>
          </Reveal>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {QA.map(([q, a], i) => {
            const on = open === i;
            return (
              <ClipReveal as="li" key={q} variant="inset-x" delay={i * 0.04} duration={0.9}>
                <h3>
                  <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? null : i)} className="group/q flex w-full items-center justify-between gap-6 py-5 text-left">
                    <span className="text-[1.0625rem] font-medium tracking-[-0.02em] text-ink">{q}</span>
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-ink-2 transition-[rotate,background-color] duration-[var(--duration-base)] ease-[var(--ease-out)] group-hover/q:bg-sunk", on && "rotate-45 bg-sunk")}><Plus className="size-4" aria-hidden /></span>
                  </button>
                </h3>
                <div id={`faq-${i}`} role="region" className={cn("grid transition-[grid-template-rows,opacity] duration-[var(--duration-slow)] ease-[var(--ease-out)]", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden"><p className="max-w-2xl pb-6 text-[0.9375rem] text-ink-2">{a}</p></div>
                </div>
              </ClipReveal>
            );
          })}
        </ul>
      </div>
      </div>
    </Band>
  );
}
