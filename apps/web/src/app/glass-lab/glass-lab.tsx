"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/cn";

interface Variant {
  id: string;
  name: string;
  note: string;
  /** Displacement scale per colour channel: red, green, blue. Equal values mean no colour split. */
  scale: [number, number, number];
  /** "rim": only the edge bends light. "lens": the whole pane magnifies, strongest at the edges. */
  map: "rim" | "lens";
  /** Rim thickness as a fraction of the height (rim maps only). */
  inset?: number;
  backdrop: string;
  fill: string;
  rim: string;
  shadow: string;
  dark?: boolean;
}

const SPEC = "conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,.95) 0deg, rgba(255,255,255,.05) 70deg, rgba(255,255,255,.05) 160deg, rgba(255,255,255,.85) 200deg, rgba(255,255,255,.05) 270deg, rgba(255,255,255,.05) 330deg, rgba(255,255,255,.95) 360deg)";
const PRISM = "conic-gradient(from 210deg at 50% 50%, rgba(125,235,255,.95), rgba(255,255,255,.9) 18%, rgba(190,160,255,.9) 38%, rgba(255,150,200,.85) 55%, rgba(255,255,255,.9) 72%, rgba(125,235,255,.95))";

const VARIANTS: Variant[] = [
  { id: "a", name: "A · Clear lens", note: "Almost no fill. Only the rim bends the page behind it, with a faint colour split. Closest to the real thing.", scale: [44, 35, 26], map: "rim", inset: 0.26, backdrop: "blur(0.6px) saturate(1.9) brightness(1.08)", fill: "linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.04) 55%,rgba(255,255,255,.1))", rim: SPEC, shadow: "inset 2px 3px 6px -2px rgba(255,255,255,.9), inset -2px -3px 6px -2px rgba(255,255,255,.55), inset 0 -14px 20px -12px rgba(8,20,60,.18), 0 18px 34px -16px rgba(10,20,60,.4)" },
  { id: "b", name: "B · Magnifier", note: "The whole pane is a lens: what is behind it is enlarged and bulges toward the edges.", scale: [26, 22, 18], map: "lens", backdrop: "blur(0.4px) saturate(1.7) brightness(1.06)", fill: "linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.02))", rim: SPEC, shadow: "inset 1px 2px 5px -1px rgba(255,255,255,.9), inset 0 -10px 18px -10px rgba(8,20,60,.2), 0 16px 32px -16px rgba(10,20,60,.4)" },
  { id: "c", name: "C · Prism edge", note: "Strong colour split at the rim: red, green and blue separate like light through cut crystal.", scale: [78, 52, 28], map: "rim", inset: 0.3, backdrop: "blur(0.8px) saturate(2.1) brightness(1.1)", fill: "linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.03))", rim: PRISM, shadow: "inset 0 1px 2px rgba(255,255,255,.8), 0 18px 34px -16px rgba(60,60,160,.4)" },
  { id: "d", name: "D · Water drop", note: "Thick glass: a wide bend all round, a deep inner shadow and a heavy highlight on the top edge.", scale: [56, 46, 36], map: "rim", inset: 0.42, backdrop: "blur(1.2px) saturate(1.8) brightness(1.04)", fill: "linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.02) 60%,rgba(200,225,255,.12))", rim: SPEC, shadow: "inset 0 3px 5px rgba(255,255,255,.95), inset 0 -18px 22px -12px rgba(10,30,90,.28), inset 0 0 18px rgba(140,190,255,.2), 0 22px 40px -18px rgba(10,20,60,.45)" },
  { id: "e", name: "E · Frosted crystal", note: "A soft frost on top of the bend: calmer and easier to read over busy pages.", scale: [34, 28, 22], map: "rim", inset: 0.28, backdrop: "blur(9px) saturate(1.9) brightness(1.08)", fill: "linear-gradient(120deg,rgba(255,255,255,.34),rgba(255,255,255,.12) 40%,rgba(255,255,255,.26))", rim: SPEC, shadow: "inset 0 1.5px 1px rgba(255,255,255,.95), inset 0 -10px 18px -8px rgba(255,255,255,.4), 0 16px 34px -16px rgba(10,20,60,.35)" },
  { id: "f", name: "F · Smoked glass", note: "Dark, tinted glass with the same bend. Best over bright, colourful sections.", scale: [48, 38, 28], map: "rim", inset: 0.28, backdrop: "blur(2px) saturate(1.6) brightness(.82)", fill: "linear-gradient(180deg,rgba(14,22,44,.5),rgba(14,22,44,.32))", rim: SPEC, shadow: "inset 0 1px 1px rgba(255,255,255,.5), inset 0 -10px 18px -10px rgba(0,0,0,.5), 0 18px 36px -16px rgba(0,0,20,.55)", dark: true },
];

function mapUri(v: Variant, w: number, h: number): string {
  const grad =
    v.map === "lens"
      ? `<linearGradient id="x" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#000"/></linearGradient><linearGradient id="y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00f"/><stop offset="1" stop-color="#000"/></linearGradient>`
      : `<linearGradient id="x" x1="0" x2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/></linearGradient><linearGradient id="y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#00f"/></linearGradient>`;
  const inset = Math.round(h * (v.inset ?? 0.26));
  const centre =
    v.map === "rim"
      ? `<rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" rx="${(h - inset * 2) / 2}" fill="rgb(128,0,128)" filter="url(#b)"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${grad}<filter id="b"><feGaussianBlur stdDeviation="${Math.round(h * 0.13)}"/></filter></defs><rect width="${w}" height="${h}" fill="#000"/><rect width="${w}" height="${h}" fill="url(#x)"/><rect width="${w}" height="${h}" fill="url(#y)" style="mix-blend-mode:screen"/>${centre}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function GlassPill({ v, className, light }: { v: Variant; className?: string; light?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [chromium, setChromium] = useState(false);
  useEffect(() => {
    setChromium(/Chrome\//.test(navigator.userAgent));
    const el = ref.current;
    if (!el) return;
    const m = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fid = `g${uid}`;
  const refract = chromium && box !== null;
  const [sr, sg, sb] = v.scale;
  const dark = v.dark || light;
  const filter = refract ? `url(#${fid}) ${v.backdrop}` : v.backdrop;
  return (
    <div
      ref={ref}
      className={cn("relative isolate flex h-14 items-center gap-2 rounded-full pl-5 pr-2", className)}
      style={{
        color: dark ? "#f6f8ff" : "#0b1220",
        textShadow: dark ? "0 1px 12px rgba(0,0,20,.55)" : "0 0 12px rgba(255,255,255,.6)",
        background: v.fill,
        WebkitBackdropFilter: filter,
        backdropFilter: filter,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,.26), ${v.shadow}`,
      }}
    >
      {refract && box && (
        <svg aria-hidden width="0" height="0" className="pointer-events-none absolute">
          <filter id={fid} filterUnits="userSpaceOnUse" x="0" y="0" width={box.w} height={box.h} colorInterpolationFilters="sRGB">
            <feImage href={mapUri(v, box.w, box.h)} x="0" y="0" width={box.w} height={box.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={sr} xChannelSelector="R" yChannelSelector="B" result="dr" />
            <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={sg} xChannelSelector="R" yChannelSelector="B" result="dg" />
            <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={sb} xChannelSelector="R" yChannelSelector="B" result="db" />
            <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb" />
            <feBlend in="cr" in2="cg" mode="screen" result="rg" />
            <feBlend in="rg" in2="cb" mode="screen" />
          </filter>
        </svg>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-full p-[1.5px]"
        style={{ background: v.rim, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)" }}
      />
      <Logo className="mr-2" />
      <span className="hidden text-sm font-medium sm:inline">Product</span>
      <span className="hidden px-2 text-sm font-medium sm:inline">Developers</span>
      <span className="hidden px-2 text-sm font-medium md:inline">Security</span>
      <span className="ml-auto inline-flex items-center gap-1.5">
        <span className="hidden text-sm font-medium sm:inline">Sign in</span>
        <span className="rounded-full px-4 py-2 text-sm font-medium" style={{ background: dark ? "#fff" : "#0c1220", color: dark ? "#0c1220" : "#fff", textShadow: "none" }}>Create account</span>
      </span>
    </div>
  );
}

/** A busy, colourful scene that moves, so the bend and the colour split are easy to see. */
function Scene({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[linear-gradient(115deg,#0b1020,#1a2a6c_35%,#b21f66_65%,#f4a52b)]" />
      <div className="absolute -left-10 top-0 h-full w-[200%] animate-[lab-drift_14s_linear_infinite] opacity-95">
        {["#12d6a0", "#ffffff", "#2f6bff", "#ffd23f", "#ff4d8d", "#7b5cff", "#00e0ff"].map((c, i) => (
          <span key={i} className="absolute rounded-full mix-blend-screen" style={{ background: c, left: `${i * 14}%`, top: `${(i * 37) % 70}%`, width: `${70 + (i % 3) * 40}px`, height: `${70 + (i % 3) * 40}px`, filter: "blur(2px)" }} />
        ))}
        <p className="absolute left-[4%] top-[18%] whitespace-nowrap text-[64px] font-semibold leading-none tracking-[-0.04em] text-white">Get paid in USDC, wherever you already sell.</p>
        <p className="absolute left-[30%] top-[56%] whitespace-nowrap text-[44px] font-semibold leading-none tracking-[-0.03em] text-black/80">Every order gets its own address.</p>
      </div>
    </div>
  );
}

export function GlassLab() {
  const [pick, setPick] = useState("a");
  const [light, setLight] = useState(true);
  const chosen = VARIANTS.find((v) => v.id === pick) ?? VARIANTS[0]!;
  return (
    <main className="min-h-dvh bg-ground pb-40 text-ink">
      <style>{`@keyframes lab-drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <header className="mx-auto max-w-5xl px-5 pt-10">
        <h1 className="text-[2rem] font-medium tracking-[-0.03em]">Glass lab</h1>
        <p className="mt-2 max-w-2xl text-ink-2">Six liquid-glass variants of the navigation pill, over a moving colourful scene. The glass has no colour of its own; every colour you see is the scene bent through it. Click one to choose it, then scroll down to see it sticky over a long page. Best in Chrome or Edge; other browsers show only the blur.</p>
        <button type="button" onClick={() => setLight(!light)} className="mt-4 rounded-full border border-line-strong bg-raised px-4 py-2 text-sm font-medium">Text colour: {light ? "light (for dark scenes)" : "dark (for light pages)"}. Click to switch</button>
        <p className="mt-3 text-sm text-ink-3">Chosen: <b className="font-medium text-ink">{chosen.name}</b></p>
      </header>

      <section aria-label="All variants" className="mx-auto mt-8 max-w-5xl px-5">
        <div className="relative overflow-hidden rounded-[2rem] p-5 sm:p-8">
          <Scene />
          <div className="relative space-y-7">
            {VARIANTS.map((v) => (
              <button key={v.id} type="button" onClick={() => setPick(v.id)} aria-pressed={pick === v.id} className="block w-full text-left">
                <GlassPill v={v} light={light} className={pick === v.id ? "outline outline-2 outline-offset-4 outline-white" : ""} />
                <span className="mt-2 block rounded-lg bg-black/55 px-3 py-1.5 text-sm text-white backdrop-blur-sm"><b className="font-medium">{v.name}.</b> {v.note}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Scroll test" className="mx-auto mt-10 max-w-5xl px-5">
        <h2 className="text-xl font-medium tracking-[-0.02em]">Scroll test: {chosen.name}</h2>
        <div className="relative mt-4 h-[140dvh] overflow-clip rounded-[2rem]">
          <Scene />
          <div className="sticky top-4 z-10 px-4 pt-4"><GlassPill v={chosen} light={light} /></div>
          <div className="absolute inset-x-0 top-[40%] space-y-10 px-8 text-white">
            <p className="text-[clamp(2rem,6vw,4.5rem)] font-semibold leading-none tracking-[-0.04em]">Nobody holds the money in between.</p>
            <p className="max-w-md text-lg text-white/85">Scroll the page: the glass keeps bending whatever passes under it.</p>
            <div className="h-40 rounded-3xl bg-[linear-gradient(90deg,#12d6a0,#2f6bff,#ff4d8d,#ffd23f)]" />
            <div className="h-40 rounded-3xl bg-white" />
            <div className="h-40 rounded-3xl bg-black" />
          </div>
        </div>
      </section>
    </main>
  );
}
