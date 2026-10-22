"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { erc20Abi } from "viem";
import { useAccount, useDisconnect, useReadContract, useSignTypedData, useSwitchChain } from "wagmi";
import { AlertTriangle, ArrowRight, ArrowUpRight, Ban, Check, LoaderCircle, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hash } from "@/components/hash";
import { Notice } from "@/components/page";
import { Amount } from "@/components/amount";
import { ChainBadge, WalletIcon } from "@/components/brand";
import { ConnectWalletDialog } from "@/components/wallet";
import { apiFetch, ClientApiError } from "@/lib/client-api";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ActionBar, utcClock, type Net } from "./checkout-parts";
import { BuyUsdc, ONRAMP_ENABLED } from "./buy-usdc";

type Phase = "idle" | "preparing" | "review" | "signing" | "submitting" | "relaying" | "rejected" | "failed";

interface Prep {
  attempt_id: string;
  amount: string;
  expires_at: string;
  typed_data: { domain: any; types: any; message: any };
}

/** Wallet payments are signed as a single gasless USDC authorisation that a relayer submits. */
export function WalletPanel({
  id,
  net,
  remaining,
  remainingUnits,
  onUseAddress,
  disabled,
  chainName,
}: {
  id: string;
  net: Net | undefined;
  remaining: string;
  remainingUnits: string;
  onUseAddress: () => void;
  disabled: boolean;
  chainName?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const run = useRef(0);

  const { address, chainId, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [switchNote, setSwitchNote] = useState<string | null>(null);
  const { signTypedDataAsync } = useSignTypedData();

  const wrongChain = isConnected && !!net && chainId !== net.chain_id;
  const sym: string = net?.token?.symbol ?? "USDC";
  const balance = useReadContract({
    abi: erc20Abi,
    address: net?.usdc_address as `0x${string}` | undefined,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: net?.chain_id,
    query: { enabled: !!net && !!address && isConnected && !wrongChain, refetchInterval: 15000 },
  });
  const have = balance.data as bigint | undefined;
  const need = BigInt(remainingUnits || "0");
  const insufficient = have !== undefined && have < need;
  const fmt = (v: bigint) => {
    const s = v.toString().padStart(7, "0");
    return `${s.slice(0, -6)}.${s.slice(-6, -4)}`;
  };

  // A different account or network invalidates a prepared request: start over rather than sign a stale one.
  useEffect(() => {
    if (phase === "review" || phase === "rejected") {
      setPhase("idle");
      setPrep(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId, net?.network]);

  // After submission, follow the relayer attempt so the payer sees the hash and any failure.
  useEffect(() => {
    if (phase !== "relaying" || !prep) return;
    let stop = false;
    const tick = async () => {
      try {
        const a = await apiFetch<{ status: string; tx_hash: string | null; error: string | null }>(`/public/checkout/${id}/wallet/attempts/${prep.attempt_id}`);
        if (stop) return;
        if (a.tx_hash) setTxHash(a.tx_hash);
        if (["FAILED", "REVERTED", "EXPIRED", "REJECTED"].includes(a.status)) {
          setError(a.error || "The transaction did not go through on-chain. Nothing was paid.");
          setPhase("failed");
        }
      } catch {
        /* keep polling; the payment itself is also followed by the page */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [phase, prep, id]);

  const reset = useCallback(() => {
    run.current++;
    setPhase("idle");
    setPrep(null);
    setError(null);
    setTxHash(null);
  }, []);

  async function switchNow() {
    if (!net) return;
    setSwitchNote(null);
    try {
      await switchChainAsync({ chainId: net.chain_id });
    } catch (e) {
      setSwitchNote(e instanceof Error && /reject|denied|cancel/i.test(e.message) ? "Switch needed to continue." : "Your wallet did not switch. Change the network in your wallet, then come back here.");
    }
  }

  async function review() {
    if (!address || !net) return;
    setError(null);
    setPhase("preparing");
    try {
      const p = await apiFetch<Prep>(`/public/checkout/${id}/wallet/prepare`, { method: "POST", body: { network: net.network, payer: address } });
      setPrep(p);
      setPhase("review");
    } catch (e) {
      setPhase("failed");
      setError(e instanceof ClientApiError ? e.message : e instanceof Error ? e.message.split("\n")[0]! : "Could not prepare the payment.");
    }
  }

  async function sign() {
    if (!prep || !net) return;
    const mine = ++run.current;
    setError(null);
    setPhase("signing");
    try {
      const td = prep.typed_data;
      const signature = await signTypedDataAsync({
        domain: { name: td.domain.name, version: td.domain.version, chainId: BigInt(td.domain.chainId), verifyingContract: td.domain.verifyingContract },
        types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization },
        primaryType: "ReceiveWithAuthorization",
        message: { from: td.message.from, to: td.message.to, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore), nonce: td.message.nonce },
      });
      if (mine !== run.current) return;
      setPhase("submitting");
      await apiFetch(`/public/checkout/${id}/wallet/submit`, { method: "POST", body: { attempt_id: prep.attempt_id, signature } });
      if (mine !== run.current) return;
      setPhase("relaying");
    } catch (e) {
      if (mine !== run.current) return;
      if (e instanceof ClientApiError) {
        setError(e.message);
        setPhase("failed");
      } else if (e instanceof Error && /reject|denied|cancel/i.test(e.message)) {
        setPhase("rejected");
      } else {
        setError(e instanceof Error ? e.message.split("\n")[0]! : "Could not complete the wallet payment.");
        setPhase("failed");
      }
    }
  }

  if (!net) return <Notice tone="warn">Wallet payment is not available on this network. {net === undefined ? "Choose another network or send to the address." : ""}</Notice>;
  if (!net.wallet_checkout_supported) {
    return (
      <div className="space-y-4">
        <Notice tone="warn"><span role="status">Wallet payment is not available on {net.name}{net.wallet_unavailable_reason ? `: ${net.wallet_unavailable_reason}` : "."} You can still pay by sending {sym} to the address.</span></Notice>
        <Button variant="primary" size="lg" className="w-full" onClick={onUseAddress}>Send to address instead</Button>
      </div>
    );
  }

  const busy = phase === "preparing" || phase === "signing" || phase === "submitting" || phase === "relaying";
  const walletName = connector?.name ?? "your wallet";

  return (
    <div className="space-y-4" aria-live="polite">
      {!isConnected ? (
        <div>
          <div className="rounded-ctl border border-line bg-wash p-4">
            <span className="grid size-10 place-items-center rounded-ctl bg-raised text-ink shadow-ctl"><Wallet className="size-5" aria-hidden /></span>
            <p className="mt-3 text-[0.9375rem] font-medium text-ink">Connect the wallet you will pay from</p>
            <p className="mt-1 text-sm text-ink-3">You sign one {sym} authorisation for {remaining} {sym}. No gas token is needed and nothing is sent until you confirm.</p>
          </div>
          <ActionBar className="mt-4">
            <Button variant="primary" size="lg" className="h-12 w-full" disabled={disabled} onClick={() => setDialog(true)}>
              <Wallet className="size-4" aria-hidden />Connect wallet
            </Button>
          </ActionBar>
          <p className="mt-3 text-xs text-ink-3">Plinth will never ask for your seed phrase. No wallet?{" "}
            <button type="button" className="font-medium text-ink underline underline-offset-4" onClick={onUseAddress}>Send to the address instead</button>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* connected pill */}
          <div className="flex items-center justify-between gap-3 rounded-ctl border border-line bg-wash px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <WalletIcon id={connector?.id ?? "injected"} icon={connector?.icon} size={28} />
              <div className="min-w-0">
                <p className="truncate text-xs text-ink-3">Paying from {walletName}</p>
                <Hash value={address!} lead={6} tail={4} className="text-ink" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {chainId !== undefined && <ChainBadge id={net.network} size={18} />}
              <button type="button" onClick={() => { disconnect(); reset(); }} className="inline-grid size-8 place-items-center rounded-ctl text-ink-3 hover:bg-sunk hover:text-ink" aria-label="Disconnect wallet">
                <LogOut className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {wrongChain && (
            <div role="alert" className="rounded-ctl border border-warn/30 bg-warn-quiet px-3.5 py-3 text-sm text-warn-ink">
              <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Wrong network: your wallet is not on {net.name}.</p>
              <p className="mt-1 pl-6">This payment is on {net.name}. Switch to continue; paying is blocked until then.</p>
              <div className="mt-2.5 pl-6">
                <Button variant="primary" size="md" loading={switching} onClick={switchNow}>{switching ? "Check your wallet" : `Switch to ${net.name}`}</Button>
                {switchNote && <p className="mt-2 text-xs">{switchNote}</p>}
              </div>
            </div>
          )}

          {!wrongChain && (phase === "idle" || phase === "preparing") && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-ctl border border-line px-3.5 py-3 text-sm">
                <dt className="text-ink-3">To pay</dt>
                <dd className="text-right"><Amount value={remaining} size="md" symbol={sym} /></dd>
                <dt className="text-ink-3">Your {sym} on {net.name}</dt>
                <dd className="text-right tnum text-ink-2" aria-live="polite">{balance.isLoading ? <span className="skeleton inline-block h-4 w-16 align-middle" aria-label="Loading balance" /> : have === undefined ? "Could not read" : `${fmt(have)} ${sym}`}</dd>
              </dl>
              {insufficient && (
                <div role="alert" className="rounded-ctl border border-bad/25 bg-bad-quiet px-3.5 py-3 text-sm text-bad-ink">
                  <p className="font-medium">Insufficient {sym}</p>
                  <p className="mt-0.5">This wallet holds {fmt(have!)} {sym} on {net.name}. {remaining} {sym} is needed.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {ONRAMP_ENABLED && address && sym === "USDC" && <BuyUsdc paymentId={id} address={address} sym={sym} />}
                    <button type="button" onClick={onUseAddress} className="font-medium underline underline-offset-4">Pay from another wallet or exchange by address</button>
                  </div>
                </div>
              )}
              <ActionBar>
                <Button variant="primary" size="lg" className="h-12 w-full" loading={phase === "preparing"} disabled={disabled || insufficient || busy} onClick={review}>
                  Review {remaining} {sym} payment <ArrowRight className="size-4" aria-hidden />
                </Button>
                {(insufficient || wrongChain) && <p className="mt-2 text-xs text-ink-3">{insufficient ? `Not enough ${sym} to continue.` : "Switch network to continue."}</p>}
              </ActionBar>
            </>
          )}

          {!wrongChain && phase === "review" && prep && (
            <div className="space-y-4 animate-[rise-in_var(--duration-base)_var(--ease-out)]">
              <div>
                <p className="text-sm font-medium text-ink">You are about to sign</p>
                <dl className="mt-2 divide-y divide-line rounded-ctl border border-line text-sm">
                  <EchoRow k="Amount" v={<Amount value={prep.amount} size="md" symbol={sym} />} />
                  <EchoRow k="Network" v={<span className="inline-flex items-center gap-2"><ChainBadge id={net.network} size={18} /></span>} />
                  <EchoRow k="To" v={<span className="text-right"><Hash value={prep.typed_data.message.to} lead={8} tail={6} href={`${net.explorer_url}/address/${prep.typed_data.message.to}`} className="text-ink" /><span className="block text-xs text-ink-3">Plinth payment router, forwards to the merchant&apos;s vault</span></span>} />
                  <EchoRow k="Network fee" v={<span className="text-ink-2">None for you</span>} />
                  <EchoRow k="Valid until" v={<span className="tnum text-ink-2">{utcClock(prep.expires_at)}, single use</span>} />
                </dl>
              </div>
              <ul className="space-y-1.5 text-sm text-ink-3">
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />Your wallet shows a signature request, not a transaction. A relayer submits it and pays the network fee.</li>
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />The authorisation only works for this amount, this router and this payment. Check these details in your wallet before you approve.</li>
              </ul>
              <ActionBar>
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="h-12" onClick={reset}>Back</Button>
                  <Button variant="primary" size="lg" className="h-12 flex-1" onClick={sign}>Sign in wallet</Button>
                </div>
              </ActionBar>
            </div>
          )}

          {!wrongChain && (phase === "signing" || phase === "submitting" || phase === "relaying") && (
            <div className="rounded-ctl border border-line bg-wash px-4 py-4 animate-[fade-in_var(--duration-base)_var(--ease-out)]" role="status">
              <div className="flex items-center gap-3">
                <WalletIcon id={connector?.id ?? "injected"} icon={connector?.icon} size={32} />
                <div>
                  <p className="font-medium text-ink">{phase === "signing" ? `Confirm in ${walletName}` : phase === "submitting" ? "Sending your signature" : "Waiting for the network"}</p>
                  <p className="text-sm text-ink-3">{phase === "signing" ? `Approve the signature request for ${prep?.amount ?? remaining} ${sym}.` : phase === "submitting" ? "Handing it to the relayer." : "The relayer is submitting it. This page moves on by itself."}</p>
                </div>
                <LoaderCircle className="ml-auto size-5 shrink-0 animate-spin text-ink-3" aria-hidden />
              </div>
              <ol className="mt-3.5 space-y-1.5 text-sm">
                <Step done={phase !== "signing"} live={phase === "signing"}>Signature</Step>
                <Step done={phase === "relaying"} live={phase === "submitting"}>Sent to relayer</Step>
                <Step done={false} live={phase === "relaying"}>
                  Included on-chain
                  {txHash && net.explorer_url && (
                    <a href={`${net.explorer_url}/tx/${txHash}`} target="_blank" rel="noreferrer noopener" className="ml-2 inline-flex items-center gap-0.5 font-mono text-xs text-ink-2 underline decoration-line-strong underline-offset-4">
                      {shortHash(txHash, 8, 6)} <ArrowUpRight className="size-3" aria-hidden />
                    </a>
                  )}
                </Step>
              </ol>
              {phase === "signing" && <button type="button" onClick={reset} className="mt-3 text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink">Cancel</button>}
            </div>
          )}

          {phase === "rejected" && (
            <div className="rounded-ctl border border-line bg-wash px-4 py-4" role="status">
              <p className="flex items-center gap-2 font-medium text-ink"><Ban className="size-4 text-ink-3" aria-hidden />Request cancelled</p>
              <p className="mt-1 text-sm text-ink-3">You declined the signature in your wallet. Nothing was sent and nothing was paid.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="md" onClick={sign}>Try again</Button>
                <Button variant="secondary" size="md" onClick={onUseAddress}>Send to address</Button>
              </div>
            </div>
          )}

          {phase === "failed" && (
            <div role="alert" className="rounded-ctl border border-bad/25 bg-bad-quiet px-4 py-4 text-bad-ink">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" aria-hidden />The payment did not go through</p>
              <p className="mt-1 text-sm">{error ?? "Something went wrong."}</p>
              {txHash && net.explorer_url && (
                <a href={`${net.explorer_url}/tx/${txHash}`} target="_blank" rel="noreferrer noopener" className="mt-1.5 inline-flex items-center gap-0.5 text-sm font-medium underline underline-offset-4">View transaction <ArrowUpRight className="size-3.5" aria-hidden /></a>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="md" onClick={reset}>Start again</Button>
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

function EchoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <dt className="shrink-0 pt-0.5 text-ink-3">{k}</dt>
      <dd className="min-w-0 text-ink">{v}</dd>
    </div>
  );
}

function Step({ done, live, children }: { done: boolean; live: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className={cn("grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-[var(--duration-base)]", done ? "border-signal bg-signal text-on-ink" : live ? "border-signal" : "border-line-strong")}>
        {done ? <Check className="size-2.5" strokeWidth={3.5} /> : live ? <span className="size-1.5 rounded-full bg-signal animate-[live-pulse_1.4s_ease-in-out_infinite]" /> : null}
      </span>
      <span className={cn(done || live ? "text-ink" : "text-ink-3")}>{children}</span>
    </li>
  );
}
