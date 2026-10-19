"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";

/* The coin's route, keyed to scroll progress. x and y are in units of the stage (0 = centre), scale is a multiple of its resting
   width. "node" and "vault" are replaced at run time by the real positions of the sweep gate and the vault in the diagram. */
type Key = { t: number; x: number | "node" | "vault"; y: number | "node" | "vault"; s: number; o: number };
const KEYS: Key[] = [
  { t: 0.0, x: 0.0, y: -0.04, s: 0.2, o: 0 },
  { t: 0.1, x: 0.0, y: -0.02, s: 0.85, o: 1 },
  { t: 0.3, x: -0.04, y: 0.02, s: 1.22, o: 1 }, // the coin fills the stage
  { t: 0.44, x: 0.0, y: 0.0, s: 1.0, o: 1 },
  { t: 0.52, x: "node", y: "node", s: 0.46, o: 1 },
  { t: 0.56, x: "node", y: "node", s: 0.58, o: 1 }, // lands with a squash and a stretch
  { t: 0.62, x: "node", y: "node", s: 0.48, o: 1 },
  { t: 0.78, x: "vault", y: "vault", s: 0.4, o: 1 },
  { t: 0.88, x: "vault", y: "vault", s: 0.2, o: 0 },
  { t: 1.0, x: "vault", y: "vault", s: 0.2, o: 0 },
];
const smooth = (x: number) => x * x * (3 - 2 * x);

interface Pt { x: number; y: number }

function Burst({ at, k }: { at: Pt; k: number }) {
  if (k === 0) return null;
  return (
    <div key={k} aria-hidden className="pointer-events-none absolute left-1/2 top-1/2" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.2;
        const d = 70 + (i % 3) * 38;
        return (
          <motion.span
            key={i}
            className="absolute size-[7px] rounded-full bg-[#12d6a0]"
            style={{ boxShadow: "0 0 12px #12d6a0" }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0, scale: 0.2 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
      <motion.span
        className="absolute -left-10 -top-10 size-20 rounded-full border-2 border-[#12d6a0]"
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 2.6, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </div>
  );
}

/**
 * The USDC coin as a character. It flies out of the distance, swoops past the camera, docks on the sweep gate with a squash,
 * rides into the vault and leaves a burst of light where it lands. It stays large and sways gently while it flies, and every landing is
 * marked by particles and a ring. All of it is driven by
 * the same scroll value as the tunnel behind it, so it plays forwards and backwards.
 */
export function CoinFlight({ progress, src }: { progress: MotionValue<number>; src: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const targets = useRef<{ node: Pt; vault: Pt }>({ node: { x: 120, y: 0 }, vault: { x: 260, y: 40 } });
  const [bursts, setBursts] = useState({ node: 0, vault: 0 });
  const [size, setSize] = useState({ w: 1000, h: 700 });

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      const centre = (sel: string): Pt | null => {
        const t = document.querySelector<HTMLElement>(`[data-coin-target="${sel}"]`);
        if (!t) return null;
        const b = t.getBoundingClientRect();
        return { x: b.left + b.width / 2 - (r.left + r.width / 2), y: b.top + b.height / 2 - (r.top + r.height / 2) };
      };
      const node = centre("node"), vault = centre("vault");
      if (node) targets.current.node = node;
      if (vault) targets.current.vault = vault;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener("scroll", measure); };
  }, []);

  const at = (v: number, axis: "x" | "y" | "s" | "o"): number => {
    let i = 0;
    while (i < KEYS.length - 2 && v > KEYS[i + 1]!.t) i++;
    const a = KEYS[i]!, b = KEYS[i + 1]!;
    const k = smooth(Math.min(1, Math.max(0, (v - a.t) / (b.t - a.t))));
    const val = (key: Key): number => {
      if (axis === "s" || axis === "o") return key[axis];
      const raw = key[axis];
      if (raw === "node" || raw === "vault") return targets.current[raw][axis];
      return raw * (axis === "x" ? size.w : size.h);
    };
    return val(a) + (val(b) - val(a)) * k;
  };

  const x = useTransform(progress, (v) => at(v, "x"));
  const y = useTransform(progress, (v) => at(v, "y"));
  const scale = useTransform(progress, (v) => at(v, "s"));
  const opacity = useTransform(progress, (v) => at(v, "o"));
  const roll = useTransform(progress, (v) => Math.sin(v * 9) * 6);
  const sway = useTransform(progress, (v) => Math.cos(v * 13) * 10);

  const last = useRef(0);
  useMotionValueEvent(progress, "change", (v) => {
    const l = last.current;
    last.current = v;
    if (l < 0.5 && v >= 0.5) setBursts((b) => ({ ...b, node: b.node + 1 }));
    if (l < 0.78 && v >= 0.78) setBursts((b) => ({ ...b, vault: b.vault + 1 }));
  });

  const img = "w-[min(64vw,52rem)] max-w-none select-none mix-blend-screen [mask-image:radial-gradient(closest-side,#000_62%,transparent_100%)]";
  return (
    <div ref={stage} aria-hidden className="pointer-events-none absolute inset-0 [perspective:1400px]">
      <motion.div className="absolute left-1/2 top-1/2 -ml-[min(32vw,26rem)] -mt-[min(18vw,14.6rem)]" style={{ x, y, scale, opacity, rotateZ: roll, rotateX: sway }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className={img} />
      </motion.div>
      <Burst at={targets.current.node} k={bursts.node} />
      <Burst at={targets.current.vault} k={bursts.vault} />
    </div>
  );
}
