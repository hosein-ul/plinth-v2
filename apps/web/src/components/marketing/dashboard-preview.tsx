"use client";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { morphPolygon } from "@/components/marketing/motion/morph-shape";
import { useCompact } from "@/components/marketing/motion/use-compact";
import { ArrowRight, Code2, FileText, LayoutGrid, Link2, ReceiptText, Users, Wallet } from "lucide-react";
import { ChainIcon, Logo } from "@/components/brand";
import { Chip, Progress5, StatusBadge } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { Magnetic } from "@/components/marketing/motion/magnetic";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { buttonStyles } from "@/components/ui/button";
import { DEMO_HREF } from "@/lib/routes";
import { cn } from "@/lib/cn";

const NAV = [
  [LayoutGrid, "Overview"], [ReceiptText, "Payments"], [Link2, "Payment links"], [FileText, "Invoices"], [Wallet, "Settlement"], [Code2, "Developers"], [Users, "Team"],
] as const;

const ROWS: { ref: string; net: string; status: string; amount: string }[] = [
  { ref: "order-1046", net: "arc-mainnet", status: "SETTLED", amount: "25.00" },
  { ref: "order-1045", net: "base-mainnet", status: "CONFIRMING", amount: "120.00" },
  { ref: "order-1044", net: "arc-mainnet", status: "AWAITING_PAYMENT", amount: "8.50" },
  { ref: "order-1043", net: "arc-mainnet", status: "SETTLED", amount: "300.00" },
  { ref: "order-1042", net: "base-mainnet", status: "UNDERPAID", amount: "42.00" },
];

function Money({ v }: { v: string }) {
  const [a, b] = v.split(".");
  return <span className="tnum font-medium text-ink">{a}<span className="text-ink-4">.{b}</span></span>;
}

export function DashboardPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.93, 1]);
  const rotate = useTransform(scrollYProgress, [0, 1], [7, 0]);
  const compact = useCompact();
  // The frame opens from a circle into the full window as it arrives.
  const clip = useTransform(scrollYProgress, (v) => morphPolygon(["circle", "squircle", "plinth"], Math.min(1, v / 0.85)));
  return (
    <Band tone="light" labelledBy="dash-h">
      <div className={wrap}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-end">
        <RevealHeading id="dash-h" as="h2" mode="line" className="t-1 text-ink" parts={[["The dashboard, as it really looks.", ""], ["Payments, vault, keys and webhooks in one place.", "text-ink-4"]]} />
        <Reveal delay={0.1}>
          <p className="text-[0.9375rem] text-ink-2">Every payment shows its settling sequence and the network it ran on. The demo is read-only and uses sample data, so you can look around without an account.</p>
        </Reveal>
      </div>

      <div ref={ref} className="relative mt-14 [perspective:1600px] sm:mt-20">
        <motion.div style={reduce ? undefined : compact ? undefined : { scale, rotateX: rotate, transformOrigin: "50% 100%", clipPath: clip }} className="mask-fade-b relative z-10">
          <div className="overflow-hidden rounded-panel border border-line-strong bg-ground shadow-float">
            <div className="flex items-center gap-3 border-b border-line bg-wash px-4 py-3">
              <span aria-hidden className="flex gap-1.5"><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /></span>
              <span className="mx-auto hidden rounded-md bg-sunk px-3 py-1 font-mono text-2xs text-ink-3 sm:block">app.plinth / payments</span>
              <Chip tone="warn" className="ml-auto">Sample data</Chip>
            </div>
            <div className="grid md:grid-cols-[13.5rem_minmax(0,1fr)]">
              <aside className="hidden border-r border-line p-4 md:block">
                <Logo asStatic size={20} className="mb-5 px-2" />
                <ul className="space-y-0.5">
                  {NAV.map(([Icon, label]) => (
                    <li key={label} className={cn("flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm", label === "Payments" ? "bg-raised font-medium text-ink shadow-low" : "text-ink-3")}>
                      <Icon className="size-4" aria-hidden />{label}
                    </li>
                  ))}
                </ul>
              </aside>
              <div className="min-w-0 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-medium tracking-[-0.03em] text-ink">Payments</h3>
                  <Chip tone="info">Arc</Chip>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
                  {([["Received", "465", "info"], ["Settled to vault", "325", "ok"], ["In flight", "140", "neutral"]] as const).map(([l, v, t]) => (
                    <div key={l} className="card-flat p-3 sm:p-4">
                      <p className="text-2xs text-ink-3 sm:text-xs">{l}</p>
                      <p className="tnum mt-1.5 text-lg font-medium tracking-[-0.04em] text-ink sm:text-2xl">{v}<span className="text-ink-4">.00</span></p>
                      <span aria-hidden className={cn("mt-2 block h-1 w-8 rounded-full", t === "ok" ? "bg-signal" : t === "info" ? "bg-info" : "bg-line-strong")} />
                    </div>
                  ))}
                </div>
                <div className="card-flat mt-4 overflow-hidden">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-wash text-xs text-ink-3">
                        <th scope="col" className="px-4 py-2.5 font-medium">Reference</th>
                        <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Network</th>
                        <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                        <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Progress</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-medium">USDC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {ROWS.map((r) => (
                        <tr key={r.ref} className="h-12 transition-colors hover:bg-wash">
                          <td className="px-4 font-mono text-xs text-ink">{r.ref}</td>
                          <td className="hidden px-3 sm:table-cell"><ChainIcon id={r.net} size={18} /></td>
                          <td className="px-3"><StatusBadge status={r.status} /></td>
                          <td className="hidden px-3 lg:table-cell"><Progress5 status={r.status} /></td>
                          <td className="px-4 text-right"><Money v={r.amount} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center">
          <Magnetic>
            <Link href={DEMO_HREF} className={cn(buttonStyles({ variant: "primary", size: "lg" }), "h-12 px-6 shadow-float")}>Open the live demo<ArrowRight className="size-4" aria-hidden /></Link>
          </Magnetic>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-ink-4">Sample data. Nothing in this window is a real payment.</p>
      </div>
    </Band>
  );
}
