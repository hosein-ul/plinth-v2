import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Chip } from "@/components/badge";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";

/** Truthful availability labels. Only use "available" when the code path exists and was tested in this repository. */
export type Availability = "available" | "in-progress" | "planned";
const AVAIL: Record<Availability, { label: string; tone: "ok" | "info" | "neutral" }> = {
  available: { label: "Available", tone: "ok" },
  "in-progress": { label: "In progress", tone: "info" },
  planned: { label: "Planned", tone: "neutral" },
};
export function AvailChip({ state }: { state: Availability }) {
  const a = AVAIL[state];
  return <Chip tone={a.tone}>{a.label}</Chip>;
}

/** Serialises structured data. `<` is escaped so no string can close the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />;
}

/** A titled section with an optional lead paragraph. */
export function Section({ id, title, lead, children, className }: { id: string; title: string; lead?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("scroll-mt-28", className)}>
      <RevealHeading id={`${id}-h`} as="h2" mode="line" className="t-2 max-w-2xl text-ink" parts={[[title, ""]]} />
      {lead && <Reveal delay={0.08} y={12}><p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">{lead}</p></Reveal>}
      {children && <Reveal delay={0.12} y={22}><div className="mt-8">{children}</div></Reveal>}
    </section>
  );
}

/** Closing call to action on a sunk panel. Primary action first, then quieter ones. */
export function CtaBand({ title, children, actions }: { title: string; children?: React.ReactNode; actions: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <section aria-label="Next step" className="rounded-panel bg-sunk p-6 sm:p-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <h2 className="t-2 max-w-xl text-ink">{title}</h2>
          {children && <p className="mt-3 max-w-xl text-[0.9375rem] text-ink-2">{children}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className={buttonStyles({ variant: a.primary ? "primary" : "secondary", size: "lg" })}>
              {a.label}
              {a.primary && <ArrowRight className="size-4" aria-hidden />}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export const inlineLink = "font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";

/** Prose wrapper for the long-form legal pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="max-w-2xl space-y-5 text-[0.9375rem] leading-relaxed text-ink-2 [&_h2]:mt-12 [&_h2]:scroll-mt-28 [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:leading-[1.1] [&_h2]:tracking-[-0.03em] [&_h2]:text-ink [&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-ink [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div>;
}

/** The mandatory draft banner for legal pages. */
export function DraftBanner({ updated, children }: { updated: string; children?: React.ReactNode }) {
  return (
    <div role="note" className="max-w-2xl rounded-card bg-warn-quiet p-5 text-sm text-warn-ink">
      <p className="font-semibold">Draft: not yet reviewed by legal counsel</p>
      <p className="mt-1.5">Last updated {updated}. {children}</p>
    </div>
  );
}
