"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReduced } from "./use-reduced";
import { useCompact } from "./use-compact";

/**
 * A section that opens like a curtain as it scrolls into view: a rounded frame hangs from its top edge, widens to the full width and drops
 * to its full height, then the mask is dropped. Phones and reduced motion get the plain section.
 */
export function IrisReveal({ children, origin = "50% 4%" }: { children: React.ReactNode; origin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const compact = useCompact();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 78%", "start 18%"] });
  const clip = useTransform(scrollYProgress, (v) => (v >= 0.995 ? "none" : `inset(0% ${((1 - v) * 24).toFixed(2)}% ${((1 - v) * 100).toFixed(2)}% ${((1 - v) * 24).toFixed(2)}% round ${(3 - v * 3).toFixed(2)}rem)`));
  if (reduce || compact) return <div>{children}</div>;
  return (
    <div ref={ref}>
      <motion.div className="paint-clip" style={{ clipPath: clip }}>{children}</motion.div>
    </div>
  );
}
