"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowUpRight, FlaskConical } from "lucide-react";
import { Logo } from "@/components/brand";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
export interface MenuLink { label: string; href: string; text?: string; icon?: Icon }
export interface MenuGroup { title: string; links: MenuLink[] }

/** Two bars that cross into an X; transform-only, so it runs on the compositor. */
function Burger({ open }: { open: boolean }) {
  const bar = "absolute left-1/2 top-1/2 block h-[1.5px] w-[18px] -translate-x-1/2 rounded-full bg-current transition-transform duration-[320ms] ease-[var(--ease-out)]";
  return (
    <span aria-hidden className="relative block size-5">
      <span className={cn(bar, open ? "translate-y-0 rotate-45" : "-translate-y-[4px]")} />
      <span className={cn(bar, open ? "translate-y-0 -rotate-45" : "translate-y-[4px]")} />
    </span>
  );
}

/**
 * Full-screen navigation for phones: an ink sheet with its own top bar, the two product areas as rich rows (icon, title,
 * one line), quick links as chips, and the account actions pinned to the bottom. It is portalled to <body>: the header
 * pill is a containing block for fixed descendants (backdrop-filter / transforms), so a sheet inside it would be sized to the pill.
 * All motion is opacity and transform.
 */
export function MobileMenu({ groups, quick, statusHref }: { groups: MenuGroup[]; quick: [string, string][]; statusHref: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const opener = openerRef.current;
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; opener?.focus({ preventScroll: true }); };
  }, [open]);
  // leaving the phone layout (rotation, resize) must not leave the page locked
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const rise = (i: number) => ({ transitionDelay: open ? `${120 + i * 38}ms` : "0ms" });
  const item = cn("transition-[opacity,transform] duration-[420ms] ease-[var(--ease-out)] motion-reduce:transition-none", open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0");
  let n = 0;

  return (
    <>
      <button ref={openerRef} type="button" aria-expanded={open} aria-controls="mobile-nav" aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-full bg-sunk text-ink transition-colors active:bg-line md:hidden">
        <Burger open={false} />
      </button>
      {mounted && createPortal(
        <div
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          aria-hidden={!open}
          inert={!open}
          className={cn(
            "surface-ink fixed inset-0 z-[60] flex flex-col overflow-hidden transition-[opacity,transform] duration-[360ms] ease-[var(--ease-out)] motion-reduce:transition-none md:hidden",
            open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-3 scale-[0.985] opacity-0",
          )}
        >
          <div className="flex h-[4.5rem] shrink-0 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
            <Logo tone="dark" />
            <button ref={closeRef} type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors active:bg-white/20">
              <Burger open />
            </button>
          </div>

          <nav aria-label="Mobile" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2">
            {groups.map((g) => (
              <section key={g.title} className="mb-7">
                <p className={cn("mb-2 text-[0.8125rem] font-medium text-white/45", item)} style={rise(n++)}>{g.title}</p>
                <ul className="grid gap-1">
                  {g.links.map((l) => (
                    <li key={l.href} className={item} style={rise(n++)}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="group -mx-2.5 flex items-center gap-3.5 rounded-2xl p-2.5 transition-colors active:bg-white/10">
                        {l.icon && <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-white"><l.icon className="size-5" aria-hidden /></span>}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[1.1875rem] font-medium leading-tight tracking-[-0.02em] text-white">{l.label}</span>
                          {l.text && <span className="mt-0.5 block text-sm text-white/55">{l.text}</span>}
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-white/30 transition-transform group-active:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <ul className={cn("flex flex-wrap gap-2", item)} style={rise(n++)}>
              {quick.map(([l, h]) => (
                <li key={h}><Link href={h} onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-[0.9375rem] font-medium text-white/90 transition-colors active:bg-white/10">{l}</Link></li>
              ))}
              <li><Link href={statusHref} onClick={() => setOpen(false)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 px-4 text-[0.9375rem] font-medium text-white/90 transition-colors active:bg-white/10">Status<ArrowUpRight className="size-3.5 text-white/50" aria-hidden /></Link></li>
            </ul>
          </nav>

          <div className={cn("shrink-0 border-t border-white/10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4", item)} style={rise(n++)}>
            <p className="mb-3 flex items-center gap-2 text-[0.8125rem] text-white/55"><FlaskConical className="size-3.5" aria-hidden />Live on Arc mainnet. Audited contracts.</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Link href="/login" onClick={() => setOpen(false)} className="inline-flex h-12 items-center justify-center rounded-ctl border border-white/20 text-[0.9375rem] font-medium text-white transition-colors active:bg-white/10">Sign in</Link>
              <Link href="/signup" onClick={() => setOpen(false)} className={cn(buttonStyles({ variant: "secondary", size: "lg" }), "h-12 justify-center")}>Create account</Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
