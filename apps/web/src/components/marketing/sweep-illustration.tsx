"use client";
import { motion, useTransform, type MotionValue } from "motion/react";
import { Lock } from "lucide-react";
import { TokenIcon } from "@/components/brand";
import { FitBox } from "@/components/marketing/fit-box";
import { useReduced } from "@/components/marketing/motion/use-reduced";

const ADDR = ["0x8b2c…e07d", "0x41f9…a2c1", "0xd07e…93b4", "0x6a15…0ce8"];
const NODE = { x: 262, y: 238 };
const VAULT = { x: 410, y: 136, w: 150, h: 204 };

/** Each invoice card sits on its own row; each coin travels card, gate, vault along one path. */
const rowY = (i: number) => 46 + i * 98;
const pathFor = (i: number) => {
  const y = rowY(i) + 28;
  return `M196,${y} C236,${y} 214,${NODE.y} ${NODE.x},${NODE.y} L ${VAULT.x + 10},${NODE.y}`;
};

function Coin({ i, progress, still }: { i: number; progress: MotionValue<number>; still?: boolean }) {
  const start = 0.08 + i * 0.17;
  const end = start + 0.2;
  const dist = useTransform(progress, [start, end], ["0%", "100%"]);
  const op = useTransform(progress, [start - 0.02, start, end - 0.015, end], [0, 1, 1, 0]);
  return (
    <motion.div
      aria-hidden
      className="absolute left-0 top-0"
      style={still ? { opacity: 0 } : { offsetPath: `path("${pathFor(i)}")`, offsetDistance: dist, opacity: op, offsetRotate: "0deg", translate: "-14px -14px" }}
    >
      <TokenIcon symbol="USDC" size={28} />
    </motion.div>
  );
}

/**
 * The statement, drawn. Four invoices each have their own address; their USDC is swept through one gate with no arguments into
 * a vault that only the owner's wallet controls. The coins and the vault level are driven by scroll, so it plays forwards and back.
 */
export function SweepIllustration({ progress }: { progress: MotionValue<number> }) {
  const reduce = useReduced();
  const level = useTransform(progress, [0.2, 0.88], ["8%", "86%"]);
  const gate = useTransform(progress, [0.05, 0.3, 0.75], [0.35, 1, 1]);
  const lock = useTransform(progress, [0.82, 0.96], [0.35, 1]);
  const line = useTransform(progress, [0.05, 0.9], [0, 1]);
  return (
    <FitBox w={580} h={480} className="select-none">
      <svg viewBox="0 0 580 480" width="580" height="480" aria-hidden className="absolute inset-0 overflow-visible">
        {ADDR.map((_, i) => <path key={i} d={pathFor(i)} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth={1.5} strokeDasharray="3 6" />)}
        {ADDR.map((_, i) => <motion.path key={`m${i}`} d={pathFor(i)} fill="none" stroke="var(--color-signal)" strokeWidth={2} strokeLinecap="round" style={{ pathLength: reduce ? 1 : line, opacity: 0.8 }} />)}
      </svg>

      {ADDR.map((a, i) => (
        <div key={a} className="absolute flex w-[196px] items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-3.5 py-3" style={{ left: 0, top: rowY(i) }}>
          <TokenIcon symbol="USDC" size={26} />
          <div className="min-w-0">
            <p className="text-[11px] text-white/50">Invoice {i + 1}</p>
            <p className="font-mono text-[13px] text-white/90">{a}</p>
          </div>
        </div>
      ))}

      <motion.div data-coin-target="node" className="absolute grid size-[84px] place-items-center rounded-[22px] bg-white text-center shadow-[0_18px_40px_rgb(0_0_0/0.35)]" style={{ left: NODE.x - 26, top: NODE.y - 42, scale: reduce ? 1 : gate }}>
        <span><span className="block font-mono text-[13px] font-medium text-ink">sweep()</span><span className="block text-[10px] text-ink-3">no arguments</span></span>
      </motion.div>

      <div data-coin-target="vault" className="absolute overflow-hidden rounded-[26px] border border-white/15 bg-ink-lift" style={{ left: VAULT.x, top: VAULT.y, width: VAULT.w, height: VAULT.h }}>
        <motion.div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgb(14_166_107/0.55),rgb(14_166_107/0.18))]" style={{ height: reduce ? "86%" : level }} />
        <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
        <div className="relative flex h-full flex-col items-center justify-between p-4 text-center">
          <motion.span className="grid size-11 place-items-center rounded-full bg-white/10 text-white" style={{ opacity: reduce ? 1 : lock }}><Lock className="size-5" aria-hidden /></motion.span>
          <span className="text-[13px] font-medium text-white">Your vault<span className="block text-[11px] font-normal text-white/60">only your wallet can withdraw</span></span>
        </div>
      </div>

      {!reduce && ADDR.map((_, i) => <Coin key={i} i={i} progress={progress} />)}
    </FitBox>
  );
}
