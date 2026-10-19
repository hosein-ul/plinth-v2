"use client";
import { useRef } from "react";
import { useScroll } from "motion/react";
import { MorphShape } from "./morph-shape";
import { useReduced } from "./use-reduced";

/** A soft light shape behind a band that morphs circle, squircle, arch, plinth while the band scrolls through the viewport. */
export function MorphBackdrop({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="sticky top-[12vh] mx-auto h-[76vh] w-[min(90vw,60rem)]">
        <MorphShape progress={scrollYProgress} names={["circle", "squircle", "arch", "plinth"]} still={reduce} className={className ?? "size-full bg-[radial-gradient(60%_60%_at_35%_30%,rgba(14,166,107,0.28),rgba(47,107,255,0.14)_55%,transparent_80%)]"} />
      </div>
    </div>
  );
}
