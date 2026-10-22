"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, erc20Abi, http, type EIP1193Provider } from "viem";
import { useAccount, useDisconnect } from "wagmi";
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, LoaderCircle, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hash } from "@/components/hash";
import { Notice } from "@/components/page";
import { Amount } from "@/components/amount";
import { ChainBadge, WalletIcon } from "@/components/brand";
import { ConnectWalletDialog } from "@/components/wallet";
import { cn } from "@/lib/cn";
import { ActionBar, type Net } from "./checkout-parts";

/**
 * Pay from any other network. The payer's USDC is burned on the source chain and minted by Circle's CCTP
 * (through Bridge Kit, with the Forwarding Service) straight onto this payment's deposit address. Plinth sees an
 * ordinary deposit and settles it the same way as every other payment. Bridge Kit needs no API key, and the
 * SDK is loaded only when this tab is opened.
 */

type Kit = import("@circle-fin/bridge-kit").BridgeKit;
type Adapter = Awaited<ReturnType<typeof import("@circle-fin/adapter-viem-v2").createViemAdapterFromProvider>>;
type KitChain = Extract<ReturnType<Kit["getSupportedChains"]>[number], { type: "evm" }>;
type BridgeParams = Parameters<Kit["bridge"]>[0];
type Phase = "idle" | "quoting" | "review" | "switching" | "bridging" | "done" | "failed";
type StepName = "approve" | "burn" | "fetchAttestation" | "mint";

const STEP_LABEL: Record<StepName, string> = { approve: "Allow USDC", burn: "Send from source network", fetchAttestation: "Circle confirms the transfer", mint: "Arrives on the payment address" };
const MICRO = 1_000_000n;

const toUnits = (v: string): bigint => {
  const [w = "0", f = ""] = v.split(".");
  return BigInt(w || "0") * MICRO + BigInt((f + "000000").slice(0, 6));
};
const fromUnits = (u: bigint): string => `${u / MICRO}.${(u % MICRO).toString().padStart(6, "0")}`;
const money = (u: bigint): string => {
  const s = fromUnits(u);
  const [w, f] = s.split(".");
  const cents = (f ?? "").slice(0, 2);
  return u > 0n && u < 10_000n ? `${w}.${(f ?? "").replace(/0+$/, "").padEnd(3, "0")}` : `${w}.${cents}`;
};
const roundUp = (u: bigint): bigint => ((u + 9_999n) / 10_000n) * 10_000n; // whole cents, rounded up

interface Quote {
  gross: bigint;
  fee: bigint;
  gas: string;
  gasSymbol: string;
}

export function BridgePanel({ net, remaining, remainingUnits, onUseAddress, disabled }: { net: Net | undefined; remaining: string; remainingUnits: string; onUseAddress: () => void; disabled: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [kit, setKit] = useState<Kit | null>(null);
  const [chains, setChains] = useState<KitChain[]>([]);
  const [source, setSource] = useState<string>("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [steps, setSteps] = useState<Partial<Record<StepName, { state: "live" | "done"; tx?: string }>>>({});
  const [have, setHave] = useState<bigint | null | undefined>(undefined);
  const lastResult = useRef<unknown>(null);
  const run = useRef(0);

  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const need = BigInt(remainingUnits || "0");
  const testnet = net?.environment === "testnet";

  // Load Bridge Kit only when this tab is used.
  useEffect(() => {
    if (!net?.deposit_address) return;
    let live = true;
    import("@circle-fin/bridge-kit").then(({ BridgeKit }) => {
      if (!live) return;
      const k = new BridgeKit();
      setKit(k);
      const all = k.getSupportedChains().filter((c): c is KitChain => c.type === "evm" && !!c.isTestnet === testnet && c.chainId !== net.chain_id && !!c.usdcAddress);
      all.sort((a, b) => a.name.localeCompare(b.name));
      setChains(all);
      setSource((cur) => cur || all.find((c) => /^(Base|Base_Sepolia)$/.test(c.chain))?.chain || all[0]?.chain || "");
    });
    return () => {
      live = false;
    };
  }, [net?.chain_id, net?.deposit_address, testnet]);

  const destChain = useMemo(() => kit?.getSupportedChains().find((c) => c.type === "evm" && c.chainId === net?.chain_id), [kit, net?.chain_id]);
  const src = chains.find((c) => c.chain === source);

  // Payer's USDC on the chosen source network (public RPC read, no wallet prompt).
  useEffect(() => {
    setQuote(null);
    if (phase === "review") setPhase("idle");
    setHave(undefined);
    if (!address || !src?.usdcAddress) return;
    let live = true;
    const rpc = (src as unknown as { rpcEndpoints?: string[] }).rpcEndpoints?.[0];
    createPublicClient({ transport: http(rpc) })
      .readContract({ abi: erc20Abi, address: src.usdcAddress as `0x${string}`, functionName: "balanceOf", args: [address] })
      .then((b) => live && setHave(b))
      .catch(() => live && setHave(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, source, src?.usdcAddress]);

  const reset = useCallback(() => {
    run.current++;
    setPhase("idle");
    setError(null);
    setQuote(null);
    setSteps({});
    lastResult.current = null;
  }, []);

  const adapterFor = useCallback(async (): Promise<Adapter> => {
    const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
    const provider = (await connector!.getProvider()) as EIP1193Provider;
    return createViemAdapterFromProvider({ provider });
  }, [connector]);

  const target = (adapter: Adapter) =>
    ({ from: { adapter, chain: source }, to: { recipientAddress: net!.deposit_address!, chain: destChain!.chain, useForwarder: true } }) as { from: BridgeParams["from"]; to: BridgeParams["to"] };

  /** What the payer must send so that the full remaining amount lands after the fees. */
  async function review() {
    if (!kit || !address || !net?.deposit_address || !destChain || !src) return;
    setError(null);
    setPhase("quoting");
    try {
      const adapter = await adapterFor();
      let gross = roundUp(need);
      let fee = 0n;
      let est: Awaited<ReturnType<Kit["estimate"]>> | null = null;
      for (let i = 0; i < 3; i++) {
        est = await kit.estimate({ ...target(adapter), amount: fromUnits(gross) });
        fee = (est.fees ?? []).reduce((s, f) => s + toUnits(f.amount ?? "0"), 0n);
        const next = roundUp(need + fee);
        if (next <= gross) break;
        gross = next;
      }
      const gasFee = (est?.gasFees ?? []).reduce((s, g) => s + Number(g.fees?.fee ?? 0), 0);
      setQuote({ gross, fee, gas: gasFee ? gasFee.toFixed(4) : "", gasSymbol: src.nativeCurrency?.symbol ?? "gas token" });
      setPhase("review");
    } catch (e) {
      setPhase("failed");
      setError(e instanceof Error ? e.message.split("\n")[0]! : "Could not price this transfer.");
    }
  }

  async function switchTo(chainId: number) {
    const provider = (await connector!.getProvider()) as EIP1193Provider;
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] });
  }

  async function send() {
    if (!kit || !quote || !src || !destChain || !net?.deposit_address) return;
    const mine = ++run.current;
    setError(null);
    setSteps({});
    try {
      setPhase("switching");
      await switchTo(src.chainId);
      if (mine !== run.current) return;
      setPhase("bridging");
      const adapter = await adapterFor();
      const mark = (name: StepName) => (p: { values?: { txHash?: string; state?: string } }) =>
        setSteps((s) => ({ ...s, [name]: { state: p.values?.state === "pending" ? "live" : "done", tx: p.values?.txHash ?? s[name]?.tx } }));
      for (const n of ["approve", "burn", "fetchAttestation", "mint"] as StepName[]) kit.on(n as never, mark(n) as never);
      const res = await kit.bridge({ ...target(adapter), amount: fromUnits(quote.gross) });
      lastResult.current = res;
      if (mine !== run.current) return;
      if (res.state === "success") {
        setPhase("done");
      } else {
        const bad = res.steps.find((s) => s.state === "error");
        setError(`${bad ? STEP_LABEL[bad.name as StepName] ?? bad.name : "The transfer"} did not complete. ${bad?.errorMessage ?? ""}`.trim());
        setPhase("failed");
      }
    } catch (e) {
      if (mine !== run.current) return;
      const m = e instanceof Error ? e.message : "";
      if (/reject|denied|cancel/i.test(m)) {
        setPhase("review");
        setError("You declined the request in your wallet. Nothing was sent.");
      } else {
        setError(m.split("\n")[0] || "Could not complete the transfer.");
        setPhase("failed");
      }
    }
  }

  async function retry() {
    if (!kit || !lastResult.current) return reset();
    const mine = ++run.current;
    setError(null);
    setPhase("bridging");
    try {
      const adapter = await adapterFor();
      const res = await kit.retry(lastResult.current as never, { from: adapter, to: adapter } as never);
      lastResult.current = res;
      if (mine !== run.current) return;
      if (res.state === "success") setPhase("done");
      else {
        setError("The transfer is still not complete. Your funds are safe; try again in a minute.");
        setPhase("failed");
      }
    } catch (e) {
      if (mine !== run.current) return;
      setError(e instanceof Error ? e.message.split("\n")[0]! : "Retry failed.");
      setPhase("failed");
    }
  }

  if (!net?.deposit_address) return <Notice tone="warn">No deposit address is available on this network for this payment.</Notice>;
  if ((net.token?.symbol ?? "USDC") !== "USDC") {
    return (
      <div className="space-y-4">
        <Notice tone="warn">Paying from another network works for USDC payments. This payment is in {net.token?.symbol}.</Notice>
        <Button variant="primary" size="lg" className="w-full" onClick={onUseAddress}>Send to address instead</Button>
      </div>
    );
  }

  const sym = "USDC";
  const insufficient = quote ? have !== undefined && have !== null && have < quote.gross : false;
  const busy = phase === "quoting" || phase === "switching" || phase === "bridging";
  const walletName = connector?.name ?? "your wallet";
  const srcName = src?.name ?? "the source network";

  return (
    <div className="space-y-4" aria-live="polite">
      {!isConnected ? (
        <div>
          <div className="rounded-ctl border border-line bg-wash p-4">
            <span className="grid size-10 place-items-center rounded-ctl bg-raised text-ink shadow-ctl"><Wallet className="size-5" aria-hidden /></span>
            <p className="mt-3 text-[0.9375rem] font-medium text-ink">Pay with USDC from another network</p>
            <p className="mt-1 text-sm text-ink-3">Your USDC on Ethereum, Base, Arbitrum and other networks is sent to {net.name} with Circle&apos;s CCTP. You pay the {net.name} amount plus Circle&apos;s transfer fee, and the network fee on the source network.</p>
          </div>
          <ActionBar className="mt-4">
            <Button variant="primary" size="lg" className="h-12 w-full" disabled={disabled} onClick={() => setDialog(true)}>
              <Wallet className="size-4" aria-hidden />Connect wallet
            </Button>
          </ActionBar>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-ctl border border-line bg-wash px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <WalletIcon id={connector?.id ?? "injected"} icon={connector?.icon} size={28} />
              <div className="min-w-0">
                <p className="truncate text-xs text-ink-3">Paying from {walletName}</p>
                <Hash value={address!} lead={6} tail={4} className="text-ink" />
              </div>
            </div>
            <button type="button" onClick={() => { disconnect(); reset(); }} className="inline-grid size-8 place-items-center rounded-ctl text-ink-3 hover:bg-sunk hover:text-ink" aria-label="Disconnect wallet">
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>

          {(phase === "idle" || phase === "quoting" || phase === "review") && (
            <>
              <div>
                <label htmlFor="bridge-source" className="label">Pay from</label>
                <select
                  id="bridge-source"
                  value={source}
                  onChange={(e) => { setSource(e.target.value); setError(null); }}
                  disabled={busy || !chains.length}
                  className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-raised px-3 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
                >
                  {!chains.length && <option>Loading networks…</option>}
                  {chains.map((c) => <option key={c.chain} value={c.chain}>{c.name}</option>)}
                </select>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-ctl border border-line px-3.5 py-3 text-sm">
                <dt className="text-ink-3">Arrives on {net.name}</dt>
                <dd className="text-right"><Amount value={remaining} size="md" symbol={sym} /></dd>
                <dt className="text-ink-3">Your {sym} on {srcName}</dt>
                <dd className="text-right tnum text-ink-2">{have === undefined ? <span className="skeleton inline-block h-4 w-16 align-middle" aria-label="Loading balance" /> : have === null ? "Could not read" : `${money(have)} ${sym}`}</dd>
              </dl>
              {phase === "review" && quote && (
                <dl className="divide-y divide-line rounded-ctl border border-line text-sm animate-[rise-in_var(--duration-base)_var(--ease-out)]">
                  <Row k="You send" v={<Amount value={money(quote.gross)} size="md" symbol={sym} />} />
                  <Row k="Circle transfer fee" v={<span className="tnum text-ink-2">{money(quote.fee)} {sym}</span>} />
                  <Row k={`Network fee on ${srcName}`} v={<span className="tnum text-ink-2">{quote.gas ? `about ${quote.gas} ${quote.gasSymbol}` : "paid in your wallet"}</span>} />
                  <Row k="To" v={<Hash value={net.deposit_address} lead={8} tail={6} href={`${net.explorer_url}/address/${net.deposit_address}`} className="text-ink" />} />
                </dl>
              )}
              {insufficient && (
                <div role="alert" className="rounded-ctl border border-bad/25 bg-bad-quiet px-3.5 py-3 text-sm text-bad-ink">
                  <p className="font-medium">Insufficient {sym} on {srcName}</p>
                  <p className="mt-0.5">{money(quote!.gross)} {sym} is needed including fees; this wallet holds {money(have!)}.</p>
                </div>
              )}
              {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
              <ActionBar>
                {phase === "review" ? (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="lg" className="h-12" onClick={reset}>Back</Button>
                    <Button variant="primary" size="lg" className="h-12 flex-1" disabled={disabled || insufficient} onClick={send}>Send {money(quote!.gross)} {sym}</Button>
                  </div>
                ) : (
                  <Button variant="primary" size="lg" className="h-12 w-full" loading={phase === "quoting"} disabled={disabled || !kit || !src || busy} onClick={review}>
                    Review transfer <ArrowRight className="size-4" aria-hidden />
                  </Button>
                )}
              </ActionBar>
              <ul className="space-y-1.5 text-sm text-ink-3">
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Circle&apos;s own cross-chain protocol. USDC is burned on {srcName} and minted on {net.name}; nothing is wrapped.</li>
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Your wallet will ask you to switch network and to approve USDC, then to send it.</li>
              </ul>
            </>
          )}

          {(phase === "switching" || phase === "bridging" || phase === "done") && (
            <div className="rounded-ctl border border-line bg-wash px-4 py-4" role="status">
              <div className="flex items-center gap-3">
                <ChainBadge id={net.network} size={28} />
                <div>
                  <p className="font-medium text-ink">{phase === "done" ? "Sent. Waiting for it to appear here" : phase === "switching" ? `Switch to ${srcName}` : `Confirm in ${walletName}`}</p>
                  <p className="text-sm text-ink-3">{phase === "done" ? "This page moves on by itself once the payment is seen." : "Keep this page open. Transfers usually take under a minute."}</p>
                </div>
                {phase !== "done" && <LoaderCircle className="ml-auto size-5 shrink-0 animate-spin text-ink-3" aria-hidden />}
              </div>
              <ol className="mt-3.5 space-y-1.5 text-sm">
                {(Object.keys(STEP_LABEL) as StepName[]).map((n) => (
                  <li key={n} className="flex items-center gap-2.5">
                    <span aria-hidden className={cn("grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]", steps[n]?.state === "done" || phase === "done" ? "border-signal bg-signal text-on-ink" : "border-line-strong")}>
                      {(steps[n]?.state === "done" || phase === "done") && <Check className="size-2.5" strokeWidth={3.5} />}
                    </span>
                    <span className={cn(steps[n] || phase === "done" ? "text-ink" : "text-ink-3")}>
                      {STEP_LABEL[n]}
                      {steps[n]?.tx && n !== "fetchAttestation" && (
                        <span className="ml-2 font-mono text-xs text-ink-3">{steps[n]!.tx!.slice(0, 8)}…</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              {phase === "done" && src && <a href={`${net.explorer_url}/address/${net.deposit_address}`} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-0.5 text-sm font-medium text-ink-2 underline underline-offset-4">View the payment address <ArrowUpRight className="size-3.5" aria-hidden /></a>}
            </div>
          )}

          {phase === "failed" && (
            <div role="alert" className="rounded-ctl border border-bad/25 bg-bad-quiet px-4 py-4 text-bad-ink">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" aria-hidden />The transfer did not finish</p>
              <p className="mt-1 text-sm">{error ?? "Something went wrong."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {lastResult.current ? <Button variant="primary" size="md" onClick={retry}>Resume transfer</Button> : <Button variant="primary" size="md" onClick={reset}>Start again</Button>}
                <Button variant="secondary" size="md" onClick={onUseAddress}>Send to address</Button>
              </div>
            </div>
          )}
        </div>
      )}
      <ConnectWalletDialog open={dialog} onOpenChange={setDialog} chainId={net.chain_id} />
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <dt className="shrink-0 pt-0.5 text-ink-3">{k}</dt>
      <dd className="min-w-0 text-right text-ink">{v}</dd>
    </div>
  );
}
