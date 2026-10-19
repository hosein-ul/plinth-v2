"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Activity, ArrowRight, Sparkles, BookOpen, ChevronDown, FlaskConical, Network, Play, Plug, Store, Tag, Terminal, Webhook } from "lucide-react";
import { Logo } from "@/components/brand";
import { MobileMenu, type MenuGroup } from "@/components/marketing/mobile-menu";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { buttonStyles } from "@/components/ui/button";
import { DEMO_HREF } from "@/lib/routes";
import { cn } from "@/lib/cn";

type Icon = typeof Store;
interface Item { icon: Icon; title: string; text: string; href: string }
interface Mega { key: string; label: string; items: Item[]; feature: { eyebrow: string; title: string; text: string; cta: string; href: string } }

const MEGAS: Mega[] = [
  {
    key: "product",
    label: "Product",
    items: [
      { icon: Store, title: "Use cases", text: "Stores, billing, invoices, links.", href: "/use-cases" },
      { icon: Plug, title: "Integrations", text: "What exists, what is planned.", href: "/integrations" },
      { icon: Network, title: "Networks and assets", text: "Official USDC, per network.", href: "/networks" },
      { icon: Tag, title: "Pricing", text: "How fees will work.", href: "/pricing" },
    ],
    feature: { eyebrow: "Read-only", title: "Try the dashboard", text: "A fully populated demo on sample data. No account needed.", cta: "Open the live demo", href: DEMO_HREF },
  },
  {
    key: "developers",
    label: "Developers",
    items: [
      { icon: Sparkles, title: "Build with AI", text: "Copy a prompt; your assistant builds it.", href: "/build-with-ai" },
      { icon: Terminal, title: "Quickstart", text: "One request creates a payment.", href: "/developers#quickstart" },
      { icon: BookOpen, title: "API reference", text: "Versioned REST with OpenAPI.", href: "/developers#api" },
      { icon: Webhook, title: "Webhooks", text: "Signed, retried, replayable.", href: "/developers#webhooks" },
      { icon: FlaskConical, title: "Go live", text: "Create a key and take a payment.", href: "/developers#sandbox" },
    ],
    feature: { eyebrow: "Live", title: "System status", text: "Operational state and latest block, read from the running stack.", cta: "Open the status page", href: "/status" },
  },
];

const LINKS: [string, string][] = [["Security", "/security"], ["FAQ", "/faq"]];

const asLinks = (key: string) => MEGAS.find((m) => m.key === key)!.items.map((i) => ({ label: i.title, href: i.href, text: i.text, icon: i.icon }));
const MENU: MenuGroup[] = [
  { title: "Product", links: [{ label: "Live demo", href: DEMO_HREF, text: "A populated dashboard on sample data.", icon: Play }, ...asLinks("product")] },
  { title: "Developers", links: asLinks("developers") },
];
const QUICK: [string, string][] = [["Security", "/security"], ["FAQ", "/faq"], ["Contact", "/contact"]];

/**
 * A floating pill. The hover indicator is one shared element that glides between items; Product and Developers open a
 * panel with real links and one featured entry. Opens on hover or focus, closes on Escape, leaving the pill, or a click.
 */
export function SiteHeader() {
  const reduce = useReduced();
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // Tone: read what the pill is floating over and switch between dark-on-light and light-on-dark text.
  useEffect(() => {
    const el = pill.current;
    if (!el) return;
    let raf = 0;
    const lum = (c: string) => {
      const m = c.match(/[\d.]+/g);
      if (!m) return null;
      const [r = 0, g = 0, b = 0, a = 1] = m.map(Number);
      return a < 0.5 ? null : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const probe = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).filter((n) => !el.contains(n) && !n.contains(el));
      let l: number | null = null;
      for (const n of stack) { l = lum(getComputedStyle(n).backgroundColor); if (l !== null) break; }
      el.dataset.tone = l !== null && l < 0.42 ? "dark" : "light";
    };
    let lastProbe = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      const now = performance.now();
      if (!raf && now - lastProbe > 120) { lastProbe = now; raf = requestAnimationFrame(probe); }
      // The last scroll event can land inside the throttle window; probe once more when scrolling stops so the tone never goes stale.
      clearTimeout(settle);
      settle = setTimeout(probe, 160);
    };
    probe();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); clearTimeout(settle); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, []);

  const enter = (k: string, hasMenu: boolean) => { clearTimeout(timer.current); setHover(k); if (hasMenu) setOpen(k); else setOpen(null); };
  const leave = () => { timer.current = setTimeout(() => { setHover(null); setOpen(null); }, 140); };
  const mega = MEGAS.find((m) => m.key === open);
  const tab = "relative inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink focus-visible:text-ink";

  return (
    <header className="sticky top-3 z-30 px-3 sm:px-5">
      <div ref={wrap} onMouseLeave={leave} onMouseEnter={() => clearTimeout(timer.current)} className="relative mx-auto max-w-[70rem]">
        <div ref={pill} onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`); }} className="flex h-14 items-center gap-2 rounded-full pl-5 pr-2 nav-glass">
          <Logo className="mr-2" />
          <LayoutGroup id="nav">
            <nav aria-label="Primary" className="hidden items-center md:flex">
              {MEGAS.map((m) => (
                <div key={m.key} onMouseEnter={() => enter(m.key, true)} className="relative">
                  <button type="button" aria-expanded={open === m.key} aria-haspopup="true" onFocus={() => enter(m.key, true)} onClick={() => setOpen(open === m.key ? null : m.key)} className={cn(tab, open === m.key && "text-ink")}>
                    {hover === m.key && <motion.span layoutId="nav-ind" className="absolute inset-0 -z-0 rounded-full bg-sunk" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }} />}
                    <span className="relative">{m.label}</span>
                    <ChevronDown className={cn("relative size-3.5 text-ink-3 transition-transform duration-[var(--duration-base)]", open === m.key && "rotate-180")} aria-hidden />
                  </button>
                </div>
              ))}
              {LINKS.map(([l, h]) => (
                <div key={h} onMouseEnter={() => enter(h, false)} className="relative">
                  <Link href={h} onFocus={() => enter(h, false)} className={tab}>
                    {hover === h && <motion.span layoutId="nav-ind" className="absolute inset-0 rounded-full bg-sunk" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }} />}
                    <span className="relative">{l}</span>
                  </Link>
                </div>
              ))}
            </nav>
          </LayoutGroup>
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/status" className="mr-1 hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-ink-3 transition-colors hover:bg-sunk hover:text-ink xl:inline-flex">
              <span aria-hidden className="relative grid size-2 place-items-center"><span className="absolute size-2 animate-[live-pulse_2s_ease-in-out_infinite] rounded-full bg-signal/50" /><span className="size-1.5 rounded-full bg-signal" /></span>Arc mainnet
            </Link>
            <Link href="/login" className={cn(buttonStyles({ variant: "ghost", size: "md" }), "hidden rounded-full sm:inline-flex")}>Sign in</Link>
            <Link href="/signup" className={cn(buttonStyles({ variant: "primary", size: "md" }), "rounded-full px-4")}>Create account</Link>
            <MobileMenu groups={MENU} quick={QUICK} statusHref="/status" />
          </div>
        </div>

        <AnimatePresence>
          {mega && (
            <motion.div
              key="panel"
              initial={reduce ? false : { opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: "50% 0" }}
              className="absolute left-1/2 top-[calc(100%+0.625rem)] hidden w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 md:block"
            >
              <div className="grid grid-cols-[1.15fr_1fr] gap-2 rounded-[1.75rem] border border-line-strong bg-raised p-2 shadow-float">
                <ul className="grid gap-0.5 p-1">
                  {mega.items.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href} onClick={() => setOpen(null)} className="group flex items-start gap-3 rounded-[1.125rem] p-3 transition-colors hover:bg-wash focus-visible:bg-wash">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunk text-ink transition-colors group-hover:bg-ink group-hover:text-on-ink"><it.icon className="size-[18px]" aria-hidden /></span>
                        <span className="min-w-0"><span className="block text-[0.9375rem] font-medium tracking-[-0.01em] text-ink">{it.title}</span><span className="block text-sm text-ink-3">{it.text}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={mega.feature.href} onClick={() => setOpen(null)} className="surface-ink dots-ink group relative isolate flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-[1.375rem] p-5 [--grid-x:80%] [--grid-y:10%]">
                  <div className="tint-mint-tr absolute inset-0 -z-10" />
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">{mega.key === "product" ? <Play className="size-3" aria-hidden /> : <Activity className="size-3" aria-hidden />}{mega.feature.eyebrow}</span>
                  <div>
                    <p className="text-[1.375rem] font-medium leading-tight tracking-[-0.03em] text-white">{mega.feature.title}</p>
                    <p className="mt-1.5 text-sm text-white/65">{mega.feature.text}</p>
                    <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white">{mega.feature.cta}<ArrowRight className="size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" aria-hidden /></p>
                  </div>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
