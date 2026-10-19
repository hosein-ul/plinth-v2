"use client";
import { motion, useScroll, useSpring } from "motion/react";
import { useReduced } from "./use-reduced";
import { useCompact } from "./use-compact";

/** A thin bar under the top edge that fills as the page is read. Compositor-only (scaleX). */
export function ScrollProgress() {
  const reduce = useReduced();
  const compact = useCompact();
  const { scrollYProgress } = useScroll();
  const x = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });
  if (reduce || compact) return null;
  return <motion.div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-ink" style={{ scaleX: x }} />;
}
