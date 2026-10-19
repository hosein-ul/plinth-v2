"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { encodeFunctionData, getAddress, parseUnits } from "viem";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Chip } from "@/components/badge";
import { WalletProvider, type NetInfo } from "@/components/checkout/wallet-provider";
import { WalletButton } from "@/components/wallet/connect-dialog";
import { Hash } from "@/components/hash";
import { EmptyState, ErrorState, KeyValue, Notice, PageHeader, Section, Skeleton } from "@/components/page";
import { Amount } from "@/components/amount";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/client-api";
import { notifyDemoReadOnly, useDataSource, useHref } from "@/lib/data-source";
import { useAction, useApi } from "@/lib/hooks";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cap, FormGroup, Ledger, SecretReveal } from "./parts-account";
import { EmailPanel } from "./email-panel";
import { useAccountEmail, useReauth } from "./reauth";
import { PayoutSection } from "./payout-views";
import { VaultCreateForm } from "./vault-create-form";

// ─────────────────────────────────────────────────────────────── Networks & assets
export function NetworksView() {
  const q = useApi<any>("/v1/networks");
  const welcome = useSearchParams().get("welcome");
  const [creating, setCreating] = useState<any>(null);
  const nets: any[] = q.data?.data ?? [];
  return (
    <>
      <PageHeader title="Networks & assets" description="Official tokens only: USDC, and EURC where the network lists it. Each network and token is enabled only after its behaviour was probed and its contracts deployed and verified." />
      {welcome && <Notice tone="info" className="mb-6">Welcome. Pick a testnet below and create your vault. You choose the owner address that alone can withdraw.</Notice>}
      {q.error && <ErrorState error={q.error} retry={() => q.refetch()} />}
      <div className="space-y-5">
        {q.isLoading && [0, 1].map((i) => (
          <div key={i} className="card-flat grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" aria-hidden>
            <div className="space-y-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-40" /><Skeleton className="h-6 w-56" /></div>
            <div className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
          </div>
        ))}
        {nets.map((n) => {
          // One row per payment token (older responses carry only USDC). Each token has its own contracts and its own vault.
          const toks: any[] = n.tokens ?? [{ symbol: "USDC", address: n.usdc.address, operational: n.operational, vault: n.vault, not_operational_reasons: n.not_operational_reasons }];
          const reasons: string[] = n.not_operational_reasons ?? [];
          return (
            <article key={n.id} className="card-flat overflow-hidden">
              <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                <div className="p-5 sm:p-6 lg:border-r lg:border-line">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="t-2 text-ink">{n.name}</h2>
                    <Chip tone={n.environment === "mainnet" ? "warn" : "neutral"} dot={false}>{cap(n.environment)}</Chip>
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-ink-3">chain id {n.chain_id} · gas in {n.gas_model === "usdc-native" ? "USDC" : n.native_currency}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Chip tone={n.operational ? "ok" : "neutral"}>{n.operational ? "Operational" : "Not enabled"}</Chip>
                    <Chip tone="neutral" dot={false} className={n.payment_methods.address ? "text-ink" : "text-ink-4 line-through"}>Address / QR</Chip>
                    <Chip tone="neutral" dot={false} className={n.payment_methods.wallet ? "text-ink" : "text-ink-4 line-through"}>Gasless wallet</Chip>
                  </div>
                  {!n.operational && reasons.length > 0 && (
                    <Notice tone="warn" className="mt-4">
                      <p className="font-medium">Not available yet</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                    </Notice>
                  )}
                </div>
                <div className="p-5 sm:p-6">
                  <KeyValue
                    items={[
                      ...toks.map((t) => ({ k: `${t.symbol} contract`, v: <Hash value={t.address} lead={10} tail={6} href={n.explorer_url ? `${n.explorer_url}/address/${t.address}` : undefined} /> })),
                      { k: "EIP-3009 receive", v: n.authorization.receive_with_authorization ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-signal-ink" aria-hidden />Verified {n.authorization.verified_at}</span> : <span className="text-ink-3">Not verified. Wallet checkout is off.</span> },
                      { k: "Finality", v: n.finality.strategy === "finalized-tag" ? "Chain-finalized block" : `${n.finality.confirmations} confirmation${n.finality.confirmations === 1 ? "" : "s"}` },
                      { k: "CCTP domain", v: <span className="font-mono text-xs">{n.circle.cctpDomain ?? "—"}</span> },
                      ...(n.fee ? [{ k: "Platform fee", v: <span><span className="font-medium text-ink">{n.fee.percent}</span> <span className="text-ink-3">of each payment, taken in the same transaction</span></span> }] : []),
                      ...(n.contracts ? [{ k: "Invoice factory", v: <Hash value={n.contracts.invoice_factory} href={n.explorer_url ? `${n.explorer_url}/address/${n.contracts.invoice_factory}` : undefined} /> }, { k: "Payment router", v: <Hash value={n.contracts.payment_router} href={n.explorer_url ? `${n.explorer_url}/address/${n.contracts.payment_router}` : undefined} /> }] : []),
                      ...toks.filter((t) => t.symbol !== "USDC" && t.contracts).map((t) => ({ k: `${t.symbol} invoice factory`, v: <Hash value={t.contracts.invoice_factory} href={n.explorer_url ? `${n.explorer_url}/address/${t.contracts.invoice_factory}` : undefined} /> })),
                      ...toks.map((t) => ({ k: `Your ${t.symbol} vault`, v: t.vault ? <div className="flex flex-wrap items-center gap-3"><Hash value={t.vault.vault_address} lead={10} tail={6} href={t.vault.vault_explorer_url} /><Chip tone={t.vault.status === "ACTIVE" ? "ok" : t.vault.status === "FAILED" ? "bad" : "info"}>{cap(t.vault.status)}</Chip></div> : <span className="text-ink-3">None yet</span> })),
                    ]}
                  />
                </div>
              </div>
              <div className="divide-y divide-line border-t border-line bg-wash">
                {toks.map((t) => {
                  const hasVault = !!t.vault;
                  const canEnable = !hasVault && !!t.operational;
                  const why: string[] = t.not_operational_reasons ?? [];
                  return (
                    <div key={t.symbol} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{t.symbol} vault on {n.name}</p>
                        <p className="text-sm text-ink-3">
                          {hasVault ? "Enabled. A vault cannot be removed once created." : t.operational ? `Switch on to create your ${t.symbol} vault and start accepting ${t.symbol} here.` : "Unavailable until this token is operational on the network."}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {canEnable && <Button size="sm" variant="primary" onClick={() => setCreating({ ...n, token: t.symbol })}>Create {t.symbol} vault</Button>}
                        <Tip content={hasVault ? "A vault is permanent once deployed." : t.operational ? `Create your ${t.symbol} vault on this network.` : why[0] ?? "This token is not operational here."}>
                          <span className="inline-flex">
                            <Switch checked={hasVault} disabled={!canEnable} onCheckedChange={(v) => v && setCreating({ ...n, token: t.symbol })} aria-label={`${t.symbol} vault on ${n.name}`} />
                          </span>
                        </Tip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      <Dialog open={!!creating} onOpenChange={(v) => !v && setCreating(null)}>
        {creating && (
          <DialogContent title={`Create your ${creating.token ?? "USDC"} vault on ${creating.name}`} description={`A non-upgradeable contract that holds your settled ${creating.token ?? "USDC"}.`}>
            <WalletProvider networks={[{ network: creating.id, chain_id: creating.chain_id, name: creating.name, environment: creating.environment, explorer_url: creating.explorer_url, native_currency: creating.chain_native, public_rpc_urls: creating.public_rpc_urls }]}>
              <VaultCreateForm network={{ id: creating.id, name: creating.name }} token={creating.token ?? "USDC"} onDone={() => setCreating(null)} />
            </WalletProvider>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────── Wallets & payouts
const withdrawAbi = [{ type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;

export function WalletsView() {
  const { readOnly } = useDataSource();
  const href = useHref();
  const nets = useApi<any>("/v1/networks");
  const all: any[] = nets.data?.data ?? [];
  const toInfo = (n: any): NetInfo => ({ network: n.id, chain_id: n.chain_id, name: n.name, environment: n.environment, explorer_url: n.explorer_url, native_currency: n.chain_native, public_rpc_urls: n.public_rpc_urls });
  const vaultInfos: NetInfo[] = all.flatMap((n) => ((n.tokens ?? [{ symbol: "USDC", vault: n.vault }]) as any[]).filter((t) => t.vault).map((t) => ({ ...toInfo(n), vaultToken: t.symbol as string })));
  // Payout choices exist on every network that can take payments, with or without a vault.
  const payoutInfos: NetInfo[] = all.filter((n) => n.operational || n.vault).map(toInfo);
  const chainIds = Object.fromEntries(payoutInfos.map((i) => [i.network, i.chain_id]));
  return (
    <>
      <PageHeader title="Wallets & payouts" description="Where your money lands and who controls it. Vault rules are changed by signing with the owner wallet. The gateway cannot do it." />
      {nets.error && <ErrorState error={nets.error} retry={() => nets.refetch()} />}
      {nets.isLoading && <VaultSkeleton />}
      {nets.data && payoutInfos.length === 0 && (
        <EmptyState title="No payout method yet" body="Create a vault from Networks & assets. It is the on-chain account your payments settle into, controlled only by the owner address you choose." action={<Button variant="primary" asChild><Link href={href("/dashboard/networks")}>Create a vault</Link></Button>} />
      )}
      {payoutInfos.length > 0 && readOnly && (
        <>
          <PayoutSection walletReady={false} chainIds={chainIds} />
          {vaultInfos.length > 0 && <h2 className="t-3 mb-4 text-ink">Your vaults</h2>}
          <div className="space-y-5">{vaultInfos.map((n) => <SampleVaultCard key={`${n.network}:${n.vaultToken}`} net={n} />)}</div>
        </>
      )}
      {payoutInfos.length > 0 && !readOnly && (
        <WalletProvider networks={payoutInfos}>
          <PayoutSection walletReady chainIds={chainIds} />
          {vaultInfos.length > 0 && <h2 className="t-3 mb-4 text-ink">Your vaults</h2>}
          <div className="space-y-5">{vaultInfos.map((n) => <VaultCard key={`${n.network}:${n.vaultToken}`} net={n} />)}</div>
        </WalletProvider>
      )}
    </>
  );
}

/**
 * Demo-only vault card: the same facts as VaultCard, without a wallet connection. Owner actions are
 * present so the page looks like the product, and each one explains that this is sample data.
 */
function SampleVaultCard({ net }: { net: NetInfo }) {
  const sym = net.vaultToken ?? "USDC";
  const q = useApi<any>(`/v1/vaults/${net.network}${net.vaultToken && net.vaultToken !== "USDC" ? `?token=${net.vaultToken}` : ""}`);
  const v = q.data;
  if (q.error && !v) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!v) return <VaultSkeleton />;
  const on = v.onchain;
  return (
    <article className="card-flat overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <h2 className="t-3 text-ink">{net.name}</h2>
          <Chip tone="neutral" dot={false}>{sym}</Chip>
          <Chip tone="ok">{cap(v.status)}</Chip>
        </div>
        <Button size="sm" onClick={notifyDemoReadOnly}>Connect wallet</Button>
      </header>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col justify-between gap-6 p-5 sm:p-6 lg:border-r lg:border-line">
          <div>
            <p className="label">Vault balance</p>
            <Amount value={(Number(on.balance_units) / 1e6).toFixed(2)} size="xl" symbol={sym} className="mt-2 block" />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={notifyDemoReadOnly}>Change settlement rules</Button>
              <Button onClick={notifyDemoReadOnly} disabled={Number(on.balance_units) === 0}>Withdraw</Button>
            </div>
            <p className="text-sm text-ink-3">Connect the owner wallet to change rules or withdraw. Rules are enforced by the contract, not by this site.</p>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <KeyValue
            items={[
              { k: "Vault", v: <Hash value={v.vault_address} lead={10} tail={6} /> },
              { k: "Owner (sole authority)", v: <Hash value={on.owner} lead={10} tail={6} /> },
              { k: "Settlement mode", v: <span className="font-mono text-xs">{on.mode}</span> },
              { k: "Payout destination", v: on.mode === "BALANCE_IN_VAULT" ? <span className="text-ink-3">None. Funds stay in the vault.</span> : <Hash value={on.destination} lead={10} tail={6} /> },
              { k: "Policy change delay", v: `${Math.round(v.config_delay_seconds / 3600 * 10) / 10} h (forwarding rules only; going back to “keep in vault” is instant)` },
              { k: "Gateway admin role", v: <span className="inline-flex items-center gap-1.5 text-signal-ink"><ShieldCheck className="size-4" aria-hidden />None, verified from the contract</span> },
            ]}
          />
        </div>
      </div>
    </article>
  );
}

function VaultSkeleton() {
  return (
    <div className="card-flat grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" aria-hidden>
      <div className="space-y-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-12 w-56" /><Skeleton className="h-9 w-64" /></div>
      <div className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
    </div>
  );
}

function VaultCard({ net }: { net: NetInfo }) {
  const sym = net.vaultToken ?? "USDC";
  const q = useApi<any>(`/v1/vaults/${net.network}${net.vaultToken && net.vaultToken !== "USDC" ? `?token=${net.vaultToken}` : ""}`, { refetchMs: 10000 });
  const v = q.data;
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [dialog, setDialog] = useState<"policy" | "withdraw" | null>(null);
  const [mode, setMode] = useState("INSTANT_FORWARD");
  const [dest, setDest] = useState("");
  const [threshold, setThreshold] = useState("");
  const [intervalH, setIntervalH] = useState("");
  const [wTo, setWTo] = useState("");
  const [wAmt, setWAmt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const on = v?.onchain;
  const isOwner = !!address && !!on && address.toLowerCase() === on.owner.toLowerCase();

  async function send(tx: { to: `0x${string}`; data: `0x${string}` }) {
    setMsg(null);
    try {
      if (chainId !== net.chain_id) await switchChainAsync({ chainId: net.chain_id });
      const hash = await sendTransactionAsync({ to: tx.to, data: tx.data, chainId: net.chain_id });
      setMsg(`Submitted ${hash}`);
      setDialog(null);
      q.refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message.split("\n")[0]! : "Transaction failed");
    }
  }
  const policy = useAction(
    () => apiFetch<any>(`/v1/vaults/${net.network}/settlement-tx${net.vaultToken && net.vaultToken !== "USDC" ? `?token=${net.vaultToken}` : ""}`, { method: "POST", body: { mode, destination: mode === "BALANCE_IN_VAULT" ? undefined : dest, threshold_units: threshold ? parseUnits(threshold, 6).toString() : undefined, interval_seconds: intervalH ? Math.round(Number(intervalH) * 3600) : undefined } }),
    { onSuccess: (tx) => send({ to: tx.to, data: tx.data }) },
  );

  if (q.error && !v) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isLoading || !v) return <VaultSkeleton />;
  return (
    <article className="card-flat overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <h2 className="t-3 text-ink">{net.name}</h2>
          <Chip tone="neutral" dot={false}>{sym}</Chip>
          <Chip tone={v.status === "ACTIVE" ? "ok" : "info"}>{cap(v.status)}</Chip>
        </div>
        {on && (
          <div className="flex flex-wrap items-center gap-2">
            {isConnected && <Chip tone={isOwner ? "ok" : "warn"}>{isOwner ? "Connected as vault owner" : "Connected wallet is not the owner"}</Chip>}
            <WalletButton chainId={net.chain_id} size="sm" />
          </div>
        )}
      </header>
      {on ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex flex-col justify-between gap-6 p-5 sm:p-6 lg:border-r lg:border-line">
            <div>
              <p className="label">Vault balance</p>
              <Amount value={(Number(on.balance_units) / 1e6).toFixed(2)} size="xl" symbol={sym} className="mt-2 block" />
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={!isOwner} onClick={() => setDialog("policy")}>Change settlement rules</Button>
                <Button disabled={!isOwner || BigInt(on.balance_units) === 0n} onClick={() => setDialog("withdraw")}>Withdraw</Button>
              </div>
              {!isOwner && <p className="text-sm text-ink-3">Connect the owner wallet to change rules or withdraw. Rules are enforced by the contract, not by this site.</p>}
              {msg && <p className="break-all rounded-ctl bg-sunk px-3 py-2 font-mono text-xs text-ink-2" role="status">{msg}</p>}
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <KeyValue
              items={[
                { k: "Vault", v: <Hash value={v.vault_address} lead={10} tail={6} href={v.vault_explorer_url} /> },
                { k: "Owner (sole authority)", v: <Hash value={on.owner} lead={10} tail={6} /> },
                ...(on.pending_owner !== "0x0000000000000000000000000000000000000000" ? [{ k: "Pending owner", v: <Hash value={on.pending_owner} lead={10} tail={6} /> }] : []),
                { k: "Settlement mode", v: <span className="font-mono text-xs">{on.mode}</span> },
                { k: "Payout destination", v: on.mode === "BALANCE_IN_VAULT" ? <span className="text-ink-3">None. Funds stay in the vault.</span> : <Hash value={on.destination} lead={10} tail={6} /> },
                { k: "Policy change delay", v: `${Math.round(v.config_delay_seconds / 3600 * 10) / 10} h (forwarding rules only; going back to “keep in vault” is instant)` },
                { k: "Gateway admin role", v: <span className="inline-flex items-center gap-1.5 text-signal-ink"><ShieldCheck className="size-4" aria-hidden />None, verified from the contract</span> },
              ]}
            />
          </div>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3 sm:px-6">Vault is {v.status.toLowerCase()}; details appear once it is deployed.</p>
      )}

      <Dialog open={dialog === "policy"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Change settlement rules" description="Signed by your wallet. Rules that forward funds activate after the vault's delay. The owner key can always withdraw at once, so protect it as you would the funds.">
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); policy.mutate(undefined); }}>
            <Field label="Mode" htmlFor="sp-mode">
              <Select id="sp-mode" value={mode} onValueChange={setMode} options={[{ value: "BALANCE_IN_VAULT", label: "Keep in vault (default)" }, { value: "INSTANT_FORWARD", label: "Instant forward" }, { value: "THRESHOLD_OR_PERIODIC", label: "Threshold or periodic" }]} />
            </Field>
            {mode !== "BALANCE_IN_VAULT" && <Field label="Payout address" htmlFor="sp-dest" hint="The ONLY address automation may ever pay."><Input id="sp-dest" className="font-mono" value={dest} onChange={(e) => setDest(e.target.value.trim())} placeholder="0x…" /></Field>}
            {mode === "THRESHOLD_OR_PERIODIC" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Forward at balance (${sym})`} htmlFor="sp-th"><Input id="sp-th" className="font-mono" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="5000" /></Field>
                <Field label="…or every (hours)" htmlFor="sp-iv"><Input id="sp-iv" className="font-mono" value={intervalH} onChange={(e) => setIntervalH(e.target.value)} placeholder="24" /></Field>
              </div>
            )}
            <div className="flex justify-end"><Button type="submit" variant="primary" loading={policy.isPending || isPending} disabled={mode !== "BALANCE_IN_VAULT" && !/^0x[0-9a-fA-F]{40}$/.test(dest)}>Sign with wallet</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "withdraw"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Withdraw from vault" description={`Sends ${sym} from the vault to any address you choose. Signed by your wallet.`}>
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void send({ to: getAddress(v.vault_address), data: encodeFunctionData({ abi: withdrawAbi, functionName: "withdraw", args: [getAddress(wTo), parseUnits(wAmt, 6)] }) }); }}>
            <Field label="To" htmlFor="wd-to"><Input id="wd-to" className="font-mono" value={wTo} onChange={(e) => setWTo(e.target.value.trim())} placeholder="0x…" /></Field>
            <Field label={`Amount (${sym})`} htmlFor="wd-amt"><Input id="wd-amt" className="font-mono" value={wAmt} onChange={(e) => setWAmt(e.target.value)} placeholder="100.00" /></Field>
            <div className="flex justify-end"><Button type="submit" variant="primary" loading={isPending} disabled={!/^0x[0-9a-fA-F]{40}$/.test(wTo) || !/^\d+(\.\d{1,6})?$/.test(wAmt)}>Sign with wallet</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────── Team
const ROLES = [
  { value: "OWNER", label: "Owner", hint: "everything" },
  { value: "ADMIN", label: "Admin", hint: "wallets, team, settings" },
  { value: "DEVELOPER", label: "Developer", hint: "payments, keys, webhooks" },
  { value: "VIEWER", label: "Viewer", hint: "read only" },
];

export function TeamView() {
  const q = useApi<any>("/v1/team");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("DEVELOPER");
  const [fresh, setFresh] = useState<any>(null);
  // Team changes decide who can later move money: each one asks the person making it to sign in again.
  const acct = useAccountEmail().data;
  const reauth = useReauth(acct?.auth_method);
  const [pend, setPend] = useState<{ kind: "role" | "remove"; id: string; who: string; role?: string } | null>(null);
  const add = useAction(() => apiFetch<any>("/v1/team", { method: "POST", body: { email, role, reauth: reauth.value() } }), { invalidate: ["/v1/team"], onSuccess: (d) => { setFresh(d); reauth.reset(); } });
  const confirmPend = useAction(
    () => (pend!.kind === "role"
      ? apiFetch(`/v1/team/${pend!.id}`, { method: "PATCH", body: { role: pend!.role, reauth: reauth.value() } })
      : apiFetch(`/v1/team/${pend!.id}/remove`, { method: "POST", body: { reauth: reauth.value() } })),
    { invalidate: ["/v1/team"], success: "Team updated", onSuccess: () => { setPend(null); reauth.reset(); } },
  );
  return (
    <>
      <PageHeader
        title="Team & permissions" description="Who can do what. API keys act with developer rights and can never touch wallets, keys or team."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFresh(null); setEmail(""); } }}>
            <DialogTrigger asChild><Button variant="primary">Add member</Button></DialogTrigger>
            <DialogContent title={fresh ? "Share the temporary password" : "Add a team member"} description={fresh ? undefined : "They sign in with this email and a temporary password."}>
              {fresh ? (
                <SecretReveal title={`Temporary password for ${fresh.email ?? email}`} value={fresh.temporary_password} note="The member should change it after signing in." doneLabel="Done" />
              ) : (
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (reauth.ready) add.mutate(undefined); }}>
                  <Field label="Email" htmlFor="tm-email"><Input id="tm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
                  <Field label="Role" htmlFor="tm-role"><Select id="tm-role" value={role} onValueChange={setRole} options={ROLES} /></Field>
                  {acct && reauth.field}
                  <div className="flex justify-end"><Button type="submit" variant="primary" disabled={!/^\S+@\S+\.\S+$/.test(email) || !reauth.ready} loading={add.isPending}>Add member</Button></div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <Dialog open={!!pend} onOpenChange={(v) => { if (!v) { setPend(null); reauth.reset(); } }}>
        <DialogContent title={pend?.kind === "remove" ? "Remove this member?" : "Change this role?"} description={pend ? (pend.kind === "remove" ? `${pend.who} loses access at once.` : `${pend.who} becomes ${pend.role}.`) : undefined}>
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (reauth.ready) confirmPend.mutate(undefined); }}>
            {acct && reauth.field}
            <div className="flex justify-end"><Button type="submit" variant="primary" disabled={!reauth.ready} loading={confirmPend.isPending}>{pend?.kind === "remove" ? "Remove member" : "Change role"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Ledger<any>
        caption="Team members" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(u) => u.id}
        empty={{ title: "No team members", body: "Add the people who run payments, keys and wallets, each with the narrowest role that fits.", action: <Button variant="primary" onClick={() => setOpen(true)}>Add member</Button> }}
        columns={[
          {
            key: "e", header: "Member",
            cell: (u) => (
              <span className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-sunk text-xs font-semibold uppercase text-ink-2">{String(u.email).charAt(0)}</span>
                <span className="truncate font-medium text-ink">{u.email}</span>
              </span>
            ),
          },
          { key: "j", header: "Joined", hideBelow: "lg", cell: (u) => <span className="text-ink-3" title={u.created_at ? formatDateTime(u.created_at) : undefined}>{u.created_at ? relativeTime(u.created_at) : "—"}</span> },
          { key: "l", header: "Last sign-in", hideBelow: "md", cell: (u) => <span className="text-ink-3">{u.last_login_at ? formatDateTime(u.last_login_at) : "Never"}</span> },
          { key: "r", header: "Role", align: "right", cell: (u) => <div className="ml-auto flex w-56 items-center justify-end gap-2 sm:w-64"><Select aria-label={`Role for ${u.email}`} value={u.role} onValueChange={(r) => { if (r !== u.role) setPend({ kind: "role", id: u.id, who: u.email, role: r }); }} options={ROLES} /><Button variant="secondary" size="sm" onClick={() => setPend({ kind: "remove", id: u.id, who: u.email })}>Remove</Button></div> },
        ]}
      />
      <Section title="What each role can do" className="mt-6">
        <dl className="grid gap-x-12 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.value} className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <dt className="font-medium text-ink">{r.label}</dt>
              <dd className="text-right text-sm text-ink-3">{r.hint}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────── Settings
export function SettingsView() {
  const q = useApi<any>("/v1/settlement-policy");
  const m = q.data?.accounting;
  const [tol, setTol] = useState<string | null>(null);
  const [exp, setExp] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const save = useAction(() => apiFetch("/v1/settlement-policy", { method: "PATCH", body: { name: name ?? undefined, underpayment_tolerance_bps: tol !== null ? Number(tol) : undefined, default_expiry_seconds: exp !== null ? Math.round(Number(exp) * 60) : undefined } }), { invalidate: ["/v1/settlement-policy", "/v1/me"], success: "Settings saved" });
  const dirty = name !== null || tol !== null || exp !== null;
  const discard = () => { setName(null); setTol(null); setExp(null); };
  if (q.error && !m) return (<><PageHeader title="Settings" description="Accounting rules applied to every payment." /><ErrorState error={q.error} retry={() => q.refetch()} /></>);
  if (!m) {
    return (
      <>
        <PageHeader title="Settings" description="Accounting rules applied to every payment." />
        <div className="card-flat divide-y divide-line" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <div className="space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" /></div>
              <div className="max-w-xl space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            </div>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Settings" description="Accounting rules applied to every payment." />
      <form className="card-flat divide-y divide-line overflow-hidden" onSubmit={(e) => { e.preventDefault(); if (dirty) save.mutate(undefined); }}>
        <FormGroup title="Business" description="How your business is named across checkout and invoices.">
          <Field label="Business name" htmlFor="st-name" hint="Leave blank to keep the current name."><Input id="st-name" placeholder="Your business" value={name ?? ""} onChange={(e) => setName(e.target.value)} /></Field>
        </FormGroup>
        <FormGroup title="Email" description="Confirms changes that affect where your money goes.">
          <EmailPanel />
        </FormGroup>
        <FormGroup title="Payment accounting" description="Applied only to funds that are final on-chain.">
          <Field label="Underpayment tolerance (basis points)" htmlFor="st-tol" hint="0 = strict. 100 = a payment up to 1% short still counts as paid. Accepted range 0 to 1000.">
            <Input id="st-tol" className="font-mono" inputMode="numeric" value={tol ?? String(m.underpayment_tolerance_bps)} onChange={(e) => setTol(e.target.value)} />
          </Field>
          <Field label="Default payment lifetime (minutes)" htmlFor="st-exp" hint="How long a new payment stays open. New accounts start at 20 minutes. Between 5 minutes and 30 days. A request can override it.">
            <Input id="st-exp" className="font-mono" inputMode="numeric" value={exp ?? String(Math.round(m.default_expiry_seconds / 60))} onChange={(e) => setExp(e.target.value)} />
          </Field>
          <p className="text-sm text-ink-3">Overpayments are always accepted, flagged <Chip tone="warn" dot={false}>Overpaid</Chip>, and the excess can be refunded. Late payments are never counted as on-time.</p>
        </FormGroup>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-wash px-5 py-4 sm:px-6">
          <p className="text-sm text-ink-3" role="status">{dirty ? "You have unsaved changes." : "All changes saved."}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={discard}>Discard</Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty}>Save settings</Button>
          </div>
        </div>
      </form>
    </>
  );
}
