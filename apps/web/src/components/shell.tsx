"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeftRight, ArrowUpRight, CreditCard, Eye, FileText, FlaskConical, History, KeyRound, Landmark, LayoutDashboard, Link2, LogOut, Menu, Network, Radio, ScrollText, Settings, Undo2, Users, Vault, Wallet, Webhook, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { notifyDemoReadOnly, useHref } from "@/lib/data-source";
import { DEMO_HREF } from "@/lib/routes";
import { useApi } from "@/lib/hooks";
import { Logo } from "./logo";


/** A wallet sign-in has no real email: its placeholder looks like wallet0x…@sso.plinth.invalid. Show the address, shortened. */
function shownIdentity(email?: string | null): string | null {
  if (!email) return null;
  const m = /^wallet(0x[0-9a-f]+)@sso\.plinth\.invalid$/i.exec(email);
  if (m) return m[1]!.length >= 42 ? `${m[1]!.slice(0, 6)}…${m[1]!.slice(-4)}` : `${m[1]!.slice(0, 8)}…`;
  return email.endsWith("@sso.plinth.invalid") ? "Signed in with Web3Auth" : email;
}

const GROUPS: { label: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    label: "Money",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
      { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/dashboard/payment-links", label: "Payment links", icon: Link2 },
      { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
      { href: "/dashboard/settlements", label: "Settlements", icon: Landmark },
      { href: "/dashboard/refunds", label: "Refund requests", icon: Undo2 },
    ],
  },
  {
    label: "Developers",
    items: [
      { href: "/dashboard/developers/api-keys", label: "API keys", icon: KeyRound },
      { href: "/dashboard/developers/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/dashboard/developers/logs", label: "Webhook logs", icon: ScrollText },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/networks", label: "Networks & assets", icon: Network },
      { href: "/dashboard/wallets", label: "Wallets & payouts", icon: Wallet },
      { href: "/dashboard/custody", label: "Custody", icon: Vault },
      { href: "/dashboard/team", label: "Team", icon: Users },
      { href: "/dashboard/audit", label: "Audit log", icon: History },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Persistent environment indicator: always says which dataset is on screen. */
export function EnvPill({ env, demo, className }: { env: "test" | "live"; demo?: boolean; className?: string }) {
  const m = demo
    ? { label: "Sample data", Icon: Eye, tone: "bg-info-quiet text-info-ink" }
    : env === "live"
      ? { label: "Live mode", Icon: Radio, tone: "bg-warn-quiet text-warn-ink" }
      : { label: "Test mode", Icon: FlaskConical, tone: "bg-sunk text-ink-2" };
  return (
    <span role="status" className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", m.tone, className)}>
      <m.Icon className="size-3.5" aria-hidden />
      {m.label}
    </span>
  );
}

export function Shell({ me, env, children, variant = "live" }: { me: { merchant: { name: string }; user: { email: string; role: string } | null; role: string }; env: "test" | "live"; children: React.ReactNode; variant?: "live" | "demo" }) {
  const demo = variant === "demo";
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const href = useHref();
  const home = href("/dashboard");
  const [open, setOpen] = useState(false);
  const isActive = (target: string) => (target === home ? pathname === target : pathname.startsWith(target));

  async function setEnv(next: "test" | "live") {
    if (next === env) return;
    if (demo) return notifyDemoReadOnly();
    await fetch("/api/env", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ env: next }) });
    qc.clear();
    router.refresh();
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initial = (me.merchant.name || "?").trim().charAt(0).toUpperCase();
  // The Custody page only exists where an operator turned custodial payouts on for some network.
  const custody = useApi<{ data: { available: boolean }[] }>("/v1/custody", { refetchMs: 60_000 });
  const custodyOn = (custody.data?.data ?? []).some((n) => n.available);

  const nav = (
    <nav aria-label="Dashboard" className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6"><Logo href={home} /></div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.href !== "/dashboard/custody" || custodyOn) })).map((g) => (
          <div key={g.label}>
            <p className="px-2.5 pb-1.5 text-xs font-medium text-ink-4">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const to = href(i.href);
                const active = isActive(to);
                return (
                  <li key={i.href}>
                    <Link
                      href={to} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-sm transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]",
                        active ? "bg-raised font-medium text-ink shadow-low" : "text-ink-2 hover:bg-sunk hover:text-ink",
                      )}
                    >
                      <i.icon className={cn("size-4", active ? "text-ink" : "text-ink-4")} aria-hidden />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="space-y-3 p-3">
        {!demo && (
          <Link href={DEMO_HREF} className="flex h-9 items-center justify-between rounded-[10px] px-2.5 text-sm text-ink-2 transition-colors hover:bg-sunk hover:text-ink">
            See a populated example<ArrowUpRight className="size-4 text-ink-4" aria-hidden />
          </Link>
        )}
        <div role="group" aria-label="Environment" className="grid grid-cols-2 gap-0.5 rounded-[13px] bg-sunk p-1 text-xs font-medium">
          {(["test", "live"] as const).map((e) => (
            <button
              key={e} onClick={() => setEnv(e)} aria-pressed={env === e}
              className={cn("flex h-7 items-center justify-center gap-1.5 rounded-[9px] transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]", env === e ? "bg-raised text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12)]" : "text-ink-3 hover:text-ink")}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full", e === "live" ? "bg-warn" : "bg-ink-4")} />
              {e === "test" ? "Test" : "Live"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 rounded-[13px] bg-raised p-2 shadow-low">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-ink text-sm font-semibold text-on-ink">{initial}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight text-ink">{me.merchant.name}</p>
            <p className="truncate text-xs text-ink-3">{shownIdentity(me.user?.email) ?? me.role.toLowerCase()}</p>
          </div>
          {demo ? (
            <Link href="/" className="grid size-8 shrink-0 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink" aria-label="Exit demo"><LogOut className="size-4" aria-hidden /></Link>
          ) : (
            <button onClick={logout} className="grid size-8 shrink-0 place-items-center rounded-[9px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink" aria-label="Sign out"><LogOut className="size-4" aria-hidden /></button>
          )}
        </div>
      </div>
    </nav>
  );

  return (
    <div className={cn("min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]", demo && "pt-12 sm:pt-10")}>
      <aside className={cn("sticky top-0 hidden h-dvh lg:block", demo && "lg:top-10 lg:h-[calc(100dvh-2.5rem)]")}>{nav}</aside>
      <div className="flex items-center justify-between px-4 py-3 lg:hidden">
        <Logo href={home} />
        <div className="flex items-center gap-2">
          <EnvPill env={env} demo={demo} />
          <button onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-ctl bg-raised shadow-low" aria-label="Open menu"><Menu className="size-5" aria-hidden /></button>
        </div>
      </div>
      {open && (
        <div className={cn("fixed inset-x-0 bottom-0 z-40 lg:hidden", demo ? "top-12 sm:top-10" : "top-0")} role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/35 animate-[fade-in_var(--duration-base)_var(--ease-out)]" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="relative h-full w-72 max-w-[85vw] bg-ground shadow-float">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 grid size-8 place-items-center rounded-ctl text-ink-3 hover:bg-sunk" aria-label="Close"><X className="size-4" aria-hidden /></button>
            {nav}
          </div>
        </div>
      )}
      <main id="main" className="min-w-0 px-4 pb-16 pt-4 sm:px-6 lg:px-10 lg:pt-9">
        <div className="mx-auto max-w-[76rem]">
          <div className="mb-5 hidden items-center gap-2.5 lg:flex">
            <EnvPill env={env} demo={demo} />
            <span className="text-xs text-ink-3">
              {demo ? "Nothing on these pages is real." : env === "live" ? "Real funds on mainnets." : "Testnets only. No real funds move."}
            </span>
          </div>
          {env === "live" && !demo && <div role="status" className="mb-6 rounded-ctl bg-warn-quiet px-3.5 py-2.5 text-sm font-medium text-warn-ink">Mainnet mode. Payments here involve real funds.</div>}
          {children}
        </div>
      </main>
    </div>
  );
}
