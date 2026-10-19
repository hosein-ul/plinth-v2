import { Check, Download, X } from "lucide-react";
import { AssetOnChain, ChainBadge, TokenIcon } from "@/components/brand";
import { Logo, LogoMark, LogoMarkAnimated } from "@/components/logo";
import { PageIntro } from "@/components/marketing/chrome";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Brand",
  description: "The Plinth mark, wordmark, colour, type and the settling sequence, with usage rules and downloadable SVG files.",
  path: "/brand",
});

const colours = [
  { name: "Ink", token: "ink", hex: "#0C1220", cls: "bg-ink", dark: true, use: "Tile, text, primary buttons" },
  { name: "Ground", token: "ground", hex: "#F3F5F8", cls: "bg-ground", use: "Page" },
  { name: "Raised", token: "raised", hex: "#FFFFFF", cls: "bg-raised", use: "Cards, plinth" },
  { name: "Signal", token: "signal", hex: "#0EA66B", cls: "bg-signal", dark: true, use: "The value on the plinth; confirmed states" },
  { name: "Signal quiet", token: "signal-quiet", hex: "#DFF5EA", cls: "bg-signal-quiet", use: "Settled fills" },
  { name: "Text 2", token: "ink-2", hex: "#485366", cls: "bg-ink-2", dark: true, use: "Secondary text" },
];

const steps = ["Detected", "Verified", "Final", "Swept", "In vault"];

function Block({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-line py-14 first:border-t-0 sm:py-20">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 className="t-2 text-ink">{title}</h2>
          {lead && <p className="mt-3 text-ink-2">{lead}</p>}
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

function Stage({ tone, children, caption }: { tone: "light" | "dark" | "mono"; children: React.ReactNode; caption: string }) {
  const bg = tone === "dark" ? "bg-ink" : tone === "mono" ? "bg-ground" : "bg-raised";
  return (
    <figure>
      <div className={cn("grid h-44 place-items-center rounded-card border border-line", bg)}>{children}</div>
      <figcaption className="mt-2 text-sm text-ink-3">{caption}</figcaption>
    </figure>
  );
}

function Rule({ ok, caption, children }: { ok: boolean; caption: string; children: React.ReactNode }) {
  return (
    <figure>
      <div className="relative grid h-28 place-items-center overflow-hidden rounded-card border border-line bg-raised">{children}</div>
      <figcaption className="mt-2 flex items-start gap-2 text-sm text-ink-2">
        {ok ? <Check className="mt-0.5 size-4 shrink-0 text-signal-ink" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0 text-bad-ink" aria-hidden />}
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

export default function BrandPage() {
  return (
    <>
      <PageIntro eyebrow="Brand" title="A plinth carries what matters. So does the mark.">
        A stepped pedestal and one round value resting on it. Plinth never holds your money; it is the base your money sits on.
      </PageIntro>

      <div className="mx-auto max-w-[75rem] px-5 pb-24 sm:px-8">
        <Block id="mark" title="The mark" lead="Rectangles and one circle on a 32 unit grid. The value is the only coloured element, and it always rests on the plinth.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stage tone="light" caption="Light surfaces (default)"><LogoMark size={96} tone="light" /></Stage>
            <Stage tone="dark" caption="Ink or photographic surfaces"><LogoMark size={96} tone="dark" /></Stage>
            <Stage tone="mono" caption="One colour: stamps, print, favicon fallbacks"><LogoMark size={96} tone="mono" /></Stage>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Stage tone="light" caption="Mark and wordmark, General Sans semibold, tracking -3.5%"><Logo asStatic size={40} /></Stage>
            <Stage tone="dark" caption="On ink"><Logo asStatic size={40} tone="dark" /></Stage>
          </div>
          <div className="mt-4 flex items-center gap-4 rounded-card border border-line bg-raised p-5">
            <LogoMarkAnimated size={44} />
            <p className="text-sm text-ink-2">
              The value drops onto the plinth once when the page loads and stays. The same motion plays on the final step of a payment.
              Reduced-motion users see the resting mark.
            </p>
          </div>
        </Block>

        <Block id="space" title="Clear space and size" lead="Keep half the mark's width free on every side. Below the minimum, the plinth steps merge.">
          <div className="grid gap-4 sm:grid-cols-2">
            <figure>
              <div className="grid h-52 place-items-center rounded-card border border-line bg-raised">
                <div className="relative p-12 outline-dashed outline-1 outline-ink-4">
                  <LogoMark size={64} />
                  <span className="absolute left-1/2 top-1 -translate-x-1/2 text-2xs text-ink-3">x</span>
                  <span className="absolute left-1 top-1/2 -translate-y-1/2 text-2xs text-ink-3">x</span>
                </div>
              </div>
              <figcaption className="mt-2 text-sm text-ink-3">x = half the mark width, on all four sides</figcaption>
            </figure>
            <figure>
              <div className="flex h-52 items-end justify-center gap-8 rounded-card border border-line bg-raised pb-10">
                <div className="text-center"><LogoMark size={16} className="mx-auto" /><p className="mt-2 text-xs text-ink-3">16 px<br />mark minimum</p></div>
                <div className="text-center"><Logo asStatic size={18} className="mx-auto" /><p className="mt-2 text-xs text-ink-3">80 px wide<br />logo minimum</p></div>
              </div>
              <figcaption className="mt-2 text-sm text-ink-3">Never set the wordmark alone below 14 px.</figcaption>
            </figure>
          </div>
        </Block>

        <Block id="colour" title="Colour" lead="Ink does the work. Mint belongs to confirmed things: the value on the plinth, and a payment that has settled.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {colours.map((c) => (
              <li key={c.token} className="overflow-hidden rounded-card border border-line bg-raised">
                <div className={cn("h-20", c.cls)} />
                <div className="p-3">
                  <p className="text-sm font-medium text-ink">{c.name}</p>
                  <p className="font-mono text-xs text-ink-3">{c.hex}</p>
                  <p className="mt-1 text-xs text-ink-3">{c.use}</p>
                </div>
              </li>
            ))}
          </ul>
        </Block>

        <Block id="type" title="Type" lead="General Sans for everything, medium weight, tightened as it grows. JetBrains Mono for addresses, hashes and code only.">
          <div className="rounded-card border border-line bg-raised p-6 sm:p-8">
            <p className="t-display text-ink">Settled.</p>
            <p className="t-2 mt-5 text-ink-3">Every invoice gets an address that can only pay you.</p>
            <p className="mt-6 font-mono text-sm text-ink-2">0x6aE2…91c4</p>
          </div>
        </Block>

        <Block id="sequence" title="The settling sequence" lead="Five states a payment passes through. They fill mint one at a time, and only because the backend says so, never from a click.">
          <ol className="grid grid-cols-5 gap-2 rounded-card border border-line bg-raised p-5 sm:gap-3 sm:p-6">
            {steps.map((s, i) => (
              <li key={s}>
                <div className={cn("h-2 rounded-full", i === steps.length - 1 ? "bg-signal" : "bg-ink")} />
                <p className={cn("mt-3 text-xs font-medium sm:text-sm", i === steps.length - 1 ? "text-signal-ink" : "text-ink-2")}>{s}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-ink-3">It appears in the checkout, the payment timeline and as a five-segment bar in tables. It is never decoration.</p>
        </Block>

        <Block id="guests" title="Chain and token marks" lead="Network, token and wallet logos belong to their owners. They sit on the plinth as guests: unedited, small, identifying only.">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded-card border border-line bg-raised p-6">
            <AssetOnChain symbol="USDC" id="base-mainnet" size={36} />
            <AssetOnChain symbol="USDC" id="arc-mainnet" size={36} />
            <AssetOnChain symbol="EURC" id="ethereum-mainnet" size={36} />
            <ChainBadge id="arc-mainnet" />
            <ChainBadge id="polygon-mainnet" />
            <span className="inline-flex items-center gap-2"><TokenIcon symbol="USDC" size={20} /><span className="font-medium">USDC</span></span>
          </div>
          <p className="mt-3 text-sm text-ink-3">
            Plinth never invents a mark, recolours one, or implies endorsement by Circle, Arc or any network or wallet.
          </p>
        </Block>

        <Block id="usage" title="Use and misuse">
          <div className="grid gap-4 sm:grid-cols-3">
            <Rule ok caption="Place on light or ink surfaces with the matching tone"><LogoMark size={44} /></Rule>
            <Rule ok caption="Use the wordmark with the mark, aligned on the plinth base"><Logo asStatic size={28} /></Rule>
            <Rule ok caption="Use the mono tone when only one colour is available"><LogoMark size={44} tone="mono" /></Rule>
            <Rule ok={false} caption="Do not stretch or squash"><LogoMark size={44} className="origin-center scale-x-[1.6]" /></Rule>
            <Rule ok={false} caption="Do not recolour"><LogoMark size={44} className="hue-rotate-[200deg]" /></Rule>
            <Rule ok={false} caption="Do not put the light mark on ink, or add shadows or glows"><div className="grid size-full place-items-center bg-ink"><LogoMark size={44} className="drop-shadow-[0_0_12px_rgb(14_166_107/0.8)]" /></div></Rule>
          </div>
        </Block>

        <Block id="files" title="Files" lead="SVG, no raster, no fonts needed. The wordmark is outlined from General Sans Semibold (Fontshare, free for commercial use).">
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              ["plinth-mark.svg", "Mark, light"],
              ["plinth-mark-dark.svg", "Mark, for ink surfaces"],
              ["plinth-mark-mono.svg", "Mark, one colour"],
              ["plinth-logo.svg", "Logo, light"],
              ["plinth-logo-dark.svg", "Logo, for ink surfaces"],
            ].map(([file = "", label]) => (
              <li key={file}>
                <a href={`/brand/${file}`} download className="group flex items-center gap-4 rounded-card border border-line bg-raised p-4 transition-colors duration-[var(--duration-fast)] hover:border-line-strong hover:bg-wash">
                  <span className={cn("grid h-14 w-20 shrink-0 place-items-center rounded-ctl", file.includes("dark") ? "bg-ink" : "bg-ground")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/brand/${file}`} alt="" className="h-9 w-auto" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{label}</span>
                    <span className="block font-mono text-xs text-ink-3">{file}</span>
                  </span>
                  <Download className="size-4 text-ink-3 group-hover:text-ink" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </>
  );
}
