"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useReduced } from "./use-reduced";

/**
 * Kinetic type: every letter lifts, scales and leans away from the pointer as it nears, like a surface being pressed from above.
 * The text keeps its normal layout (only transforms change), is read as one string by assistive tech, and is plain on touch screens.
 */
export function ProximityText({ text, className, radius = 190 }: { text: string; className?: string; radius?: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const reduce = useReduced();
  useEffect(() => {
    const el = box.current;
    if (!el || reduce || !window.matchMedia("(pointer: fine)").matches) return;
    const letters = Array.from(el.querySelectorAll<HTMLElement>("[data-l]"));
    let raf = 0, px = -9999, py = -9999;
    const paint = () => {
      raf = 0;
      for (const l of letters) {
        const r = l.getBoundingClientRect();
        const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy);
        const f = Math.max(0, 1 - d / radius);
        const e = f * f * (3 - 2 * f);
        l.style.transform = e < 0.002 ? "" : `translate3d(${(-dx / (d + 1)) * e * 10}px, ${(-dy / (d + 1)) * e * 14 - e * 8}px, 0) scale(${1 + e * 0.16}) rotate(${(-dx / radius) * e * 7}deg)`;
        l.style.opacity = e < 0.002 ? "" : String(1);
      }
    };
    const move = (ev: PointerEvent) => { px = ev.clientX; py = ev.clientY; if (!raf) raf = requestAnimationFrame(paint); };
    const leave = () => { px = py = -9999; if (!raf) raf = requestAnimationFrame(paint); };
    const host = el.closest("section") ?? el;
    host.addEventListener("pointermove", move as EventListener);
    host.addEventListener("pointerleave", leave);
    return () => { host.removeEventListener("pointermove", move as EventListener); host.removeEventListener("pointerleave", leave); cancelAnimationFrame(raf); };
  }, [reduce, radius]);
  return (
    <span ref={box} className={className} aria-label={text}>
      <span aria-hidden>
        {text.split(" ").map((w, wi, all) => (
          <span key={wi} className="inline-block whitespace-nowrap">
            {Array.from(w).map((c, ci) => (
              <span key={ci} data-l className={cn("inline-block transition-transform duration-200 ease-out will-change-transform")}>{c}</span>
            ))}
            {wi < all.length - 1 ? "\u00A0" : ""}
          </span>
        ))}
      </span>
    </span>
  );
}
