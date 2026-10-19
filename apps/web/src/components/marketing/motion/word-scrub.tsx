"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useReduced } from "./use-reduced";
import { useCompact } from "./use-compact";
import { cn } from "@/lib/cn";

function Word({ w, i, n, p, mark, reduce }: { w: string; i: number; n: number; p: MotionValue<number>; mark: boolean; reduce: boolean }) {
  const a = (i / n) * 0.9;
  const b = a + 1.6 / n;
  const opacity = useTransform(p, [a, b], [0.2, 1]);
  const line = useTransform(p, [a + 0.5 / n, b + 1.5 / n], [0, 1]);
  return (
    <>
      <motion.span className={cn("relative inline-block", mark && "text-on-ink")} style={reduce ? undefined : { opacity }}>
        {w}
        {mark && <motion.span aria-hidden className="absolute inset-x-0 -bottom-[0.06em] h-[0.09em] origin-left rounded-full bg-signal" style={reduce ? undefined : { scaleX: line }} />}
      </motion.span>{" "}
    </>
  );
}

/**
 * A statement whose words light up one after another as the reader scrolls through it.
 * `marks` are words that also get a mint underline once lit. Pass an external `progress` to share the scrub with other visuals.
 */
export function WordScrub(props: { text: string; marks?: string[]; className?: string; progress?: MotionValue<number> }) {
  const compact = useCompact();
  const { text, marks = [], className } = props;
  if (compact) {
    const set = new Set(marks.map((m) => m.toLowerCase()));
    return (
      <p className={className}>
        {text.split(" ").filter(Boolean).map((w, i) => (
          <span key={i}><span className={set.has(w.toLowerCase().replace(/[.,]/g, "")) ? "text-on-ink underline decoration-signal decoration-2 underline-offset-4" : undefined}>{w}</span>{" "}</span>
        ))}
      </p>
    );
  }
  return <WordScrubMotion {...props} />;
}

function WordScrubMotion({ text, marks = [], className, progress }: { text: string; marks?: string[]; className?: string; progress?: MotionValue<number> }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReduced();
  const own = useScroll({ target: ref, offset: ["start 78%", "end 52%"] }).scrollYProgress;
  const p = progress ?? own;
  const words = text.split(" ").filter(Boolean);
  const set = new Set(marks.map((m) => m.toLowerCase()));
  return (
    <p ref={ref} className={className} aria-label={text}>
      <span aria-hidden>
        {words.map((w, i) => <Word key={i} w={w} i={i} n={words.length} p={p} mark={set.has(w.toLowerCase().replace(/[.,]/g, ""))} reduce={reduce} />)}
      </span>
    </p>
  );
}
