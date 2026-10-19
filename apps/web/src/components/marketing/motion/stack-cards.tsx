"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/cn";
import { useReduced } from "./use-reduced";
import { useCompact } from "./use-compact";

/** One card of the stack: it pins under the previous one and, as the next card slides over it, shrinks and dims back. */
function Card({ index, height, dimTo, children }: { index: number; height: string; dimTo: number; children: React.ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const reduce = useReduced();
  const compact = useCompact();
  const still = reduce || compact;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const dim = useTransform(scrollYProgress, [0, 1], [0, dimTo]);
  return (
    <li ref={ref} className={cn("lg:sticky", height)} style={still ? undefined : { top: `calc(5.5rem + ${index} * 1.1rem)` }}>
      <motion.div className="relative h-full origin-top" style={still ? undefined : { scale }}>
        {children}
        {!still && <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black" style={{ opacity: dim }} />}
      </motion.div>
    </li>
  );
}

/** Sticky card stacking: each card pins as you scroll and the next one piles on top. Plain list on phones and with reduced motion. */
export function StackCards({ items, className, height = "lg:h-[66dvh]", dimTo = 0.45 }: { items: React.ReactNode[]; className?: string; height?: string; dimTo?: number }) {
  return (
    <ol className={cn("space-y-6 lg:space-y-10", className)}>
      {items.map((n, i) => <Card key={i} index={i} height={height} dimTo={dimTo}>{n}</Card>)}
    </ol>
  );
}
