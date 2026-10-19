import { Check, Lock, Send } from "lucide-react";
import { ChainIcon, LogoMark, TokenIcon } from "@/components/brand";

const NETS: [string, string][] = [["arc-mainnet", "Arc"], ["base-mainnet", "Base"], ["arbitrum-mainnet", "Arbitrum"], ["polygon-mainnet", "Polygon"]];

/**
 * A phone running one story on a 12 s loop: a bot offers an item with a pay button, the buyer taps it, a checkout sheet opens
 * on the buyer's network, the payment confirms, the bot delivers, and the seller is notified. It is our own chat UI (ink and
 * white bubbles), not a copy of any messenger. Everything is CSS, so it plays before hydration and costs no JavaScript.
 */
export function ChatPhone({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative mx-auto h-[620px] w-[300px]">
        <span aria-hidden className="absolute -right-[3px] top-[170px] h-[88px] w-[4px] rounded-r-sm bg-[linear-gradient(270deg,#6b717b,#c8ccd3)]" />
        <span aria-hidden className="absolute -left-[3px] top-[110px] h-[48px] w-[4px] rounded-l-sm bg-[linear-gradient(90deg,#6b717b,#c8ccd3)]" />
        <div className="absolute inset-0 rounded-[56px] bg-[linear-gradient(145deg,#e3e6ea_0%,#9097a2_28%,#d3d6dc_52%,#7a808b_78%,#c4c8ce_100%)] p-[4px] shadow-[0_50px_90px_-20px_rgb(12_18_32/0.55),0_18px_36px_-12px_rgb(12_18_32/0.35)]">
          <div className="h-full w-full rounded-[52px] bg-[#0a0c11] p-[8px]">
            <div className="relative h-full w-full overflow-hidden rounded-[44px] bg-ground text-ink">
              <div aria-hidden className="absolute left-1/2 top-[11px] z-50 h-[30px] w-[96px] -translate-x-1/2 rounded-full bg-[#05060a]" />

              {/* chat header */}
              <div className="relative z-10 flex h-[84px] items-end gap-2.5 border-b border-line bg-raised px-4 pb-3">
                <span className="grid size-9 place-items-center rounded-full bg-ink"><LogoMark size={20} tone="dark" /></span>
                <div className="leading-tight"><p className="text-[13px] font-medium">Northwind Mini App</p><p className="text-[10.5px] text-ink-3">Mini App</p></div>
              </div>

              {/* conversation */}
              <div className="relative z-0 space-y-2.5 px-3.5 pt-4">
                <div className="cp max-w-[88%] rounded-2xl rounded-bl-md bg-raised p-3 shadow-low" style={{ animationName: "cp-m1" }}>
                  <p className="text-[12.5px] font-medium">Order #1042</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">2 items, delivery included.</p>
                  <p className="tnum mt-2 text-[22px] font-medium leading-none tracking-[-0.04em]">25<span className="text-ink-4">.00</span> <span className="text-[11px] font-medium text-ink-3">USDC</span></p>
                  <div className="cp relative mt-3 grid h-9 place-items-center rounded-xl bg-ink text-[12.5px] font-medium text-on-ink" style={{ animationName: "cp-press" }}>
                    Pay 25 USDC
                    <span aria-hidden className="cp absolute right-6 top-3 size-8 rounded-full border border-ink/30 bg-ink/10" style={{ animationName: "cp-tap" }} />
                  </div>
                </div>

                <div className="cp ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-ink p-3 text-on-ink" style={{ animationName: "cp-m2" }}>
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium"><span className="grid size-4 place-items-center rounded-full bg-signal"><Check className="size-2.5" strokeWidth={4} aria-hidden /></span>Payment received</p>
                  <p className="mt-0.5 text-[11px] text-white/60">25.00 USDC on Arc</p>
                </div>

                <div className="cp max-w-[88%] rounded-2xl rounded-bl-md bg-raised p-3 shadow-low" style={{ animationName: "cp-m3" }}>
                  <p className="text-[12.5px] font-medium">Order confirmed.</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">We are packing it now.</p>
                  <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-sunk px-2.5 py-1.5 font-mono text-[10.5px] text-ink-2"><Send className="size-3" aria-hidden />tracking.example/1042</p>
                </div>
              </div>

              {/* seller notification */}
              <div className="cp absolute inset-x-3 top-[50px] z-40 flex items-start gap-2.5 rounded-[20px] bg-white/95 p-3 shadow-[0_10px_30px_rgb(12_18_32/0.22)] ring-1 ring-black/5" style={{ animationName: "cp-note" }}>
                <span className="mt-0.5 shrink-0"><LogoMark size={28} /></span>
                <span className="min-w-0 text-[11px] leading-snug"><span className="flex justify-between text-ink-3"><b className="font-semibold text-ink">Plinth</b><span>now</span></span><span className="block font-medium text-ink">Payment received</span><span className="block text-ink-2">25.00 USDC settled to your vault</span></span>
              </div>

              {/* checkout sheet */}
              <div aria-hidden className="cp absolute inset-0 z-20 bg-ink/35" style={{ animationName: "cp-dim" }} />
              <div className="cp absolute inset-x-0 bottom-0 z-30 rounded-t-[26px] border-t border-line bg-raised px-4 pb-6 pt-3 shadow-float" style={{ animationName: "cp-sheet" }}>
                <span aria-hidden className="mx-auto block h-1 w-9 rounded-full bg-line-strong" />
                <div className="mt-3 flex items-center justify-between"><p className="text-[13px] font-medium">Pay with USDC</p><span className="flex items-center gap-1 text-[10px] text-ink-3"><Lock className="size-2.5" aria-hidden />Non-custodial</span></div>
                <p className="tnum mt-2 flex items-center gap-2 text-[28px] font-medium leading-none tracking-[-0.045em]"><TokenIcon symbol="USDC" size={24} />25<span className="text-ink-4">.00</span></p>
                <p className="mt-3 text-[10.5px] font-medium text-ink-3">Pay on</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {NETS.map(([id, name], i) => (
                    <span key={id} className={i === 0 ? "flex items-center gap-1.5 rounded-lg border border-ink bg-raised px-2 py-1.5 text-[11px] font-medium shadow-ctl" : "flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] font-medium text-ink-2"}><ChainIcon id={id} size={15} />{name}</span>
                  ))}
                </div>
                <div className="cp relative mt-3 grid h-10 place-items-center overflow-hidden rounded-xl text-[13px] font-medium text-on-ink" style={{ animationName: "cp-pay" }}>
                  <span className="cp col-start-1 row-start-1" style={{ animationName: "cp-paylabel-a" }}>Pay with wallet</span>
                  <span className="cp col-start-1 row-start-1 flex items-center gap-1.5" style={{ animationName: "cp-paylabel-b" }}><Check className="size-3.5" strokeWidth={3.5} aria-hidden />Paid</span>
                </div>
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-0 z-[45] bg-[linear-gradient(112deg,rgb(255_255_255/0.28)_0%,rgb(255_255_255/0.05)_26%,transparent_44%)]" />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-xs text-ink-3">An illustration. Names and amounts are placeholders.</p>
    </div>
  );
}
