"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Amount } from "@/components/amount";
import { Chip, TxStatusBadge } from "@/components/badge";
import { CopyButton } from "@/components/copy-button";
import { Hash } from "@/components/hash";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime, relativeTime, shortHash, TX_STATUS_META } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import Link from "next/link";
import { useHref } from "@/lib/data-source";
import { cap, cellLink, CopyField, Ledger, PaymentRef } from "./parts-account";
import { StartPaymentAction } from "./create-payment";

const KIND: Record<string, string> = { INCOMING_TRANSFER: "Deposit", WALLET_PAYMENT: "Wallet payment", SWEEP: "Sweep", FORWARD: "Forward to payout", REFUND: "Refund", VAULT_CREATE: "Vault" };

export function TransactionsView() {
  const q = useApi<any>("/v1/transactions?limit=100", { refetchMs: 8000 });
  return (
    <>
      <PageHeader title="Transactions" description="Raw on-chain movements the backend has observed and independently verified. Detected, final and settled are separate states." />
      <Ledger<any>
        caption="On-chain transactions" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(t) => t.id}
        filter={{ status: (t) => t.status, statusLabel: (s) => TX_STATUS_META[s]?.label ?? cap(s), text: (t) => `${t.tx_hash} ${t.payment_intent_id ?? ""} ${t.network} ${KIND[t.kind] ?? t.kind}`, placeholder: "Search hash, payment or network" }}
        empty={{ title: "No on-chain activity yet", body: "Transfers appear here the moment they are seen on a supported network, before they are final. Create a payment and pay it from your wallet to see the first one.", action: <StartPaymentAction /> }}
        columns={[
          {
            key: "kind", header: "Type",
            cell: (t) => (
              <div className="min-w-0">
                <p className="font-medium text-ink">{KIND[t.kind] ?? t.kind}</p>
                {!t.official_asset ? <p className="text-xs font-medium text-bad-ink">Not the official token</p> : <p className="text-xs text-ink-3 lg:hidden">{t.network}</p>}
              </div>
            ),
          },
          { key: "pay", header: "Payment", hideBelow: "md", cell: (t) => <PaymentRef id={t.payment_intent_id} /> },
          { key: "net", header: "Network", hideBelow: "lg", cell: (t) => <span className="text-ink-2">{t.network}</span> },
          { key: "st", header: "Status", cell: (t) => <TxStatusBadge status={t.status} /> },
          { key: "tx", header: "Transaction", cell: (t) => <span className="inline-flex items-center gap-1.5"><Hash value={t.tx_hash} href={t.explorer_url} lead={8} tail={4} /><span className="tnum font-mono text-2xs text-ink-4">#{t.log_index}</span></span> },
          { key: "when", header: "Seen", hideBelow: "lg", cell: (t) => <span className="text-ink-3" title={formatDateTime(t.seen_at)}>{relativeTime(t.seen_at)}</span> },
          { key: "amt", header: "Amount", align: "right", cell: (t) => <Amount value={t.amount} size="sm" symbol={t.currency ?? "USDC"} unit={(t.currency ?? "USDC") !== "USDC"} /> },
        ]}
      />
    </>
  );
}

export function SettlementsView() {
  const href = useHref();
  const q = useApi<any>("/v1/settlements?limit=100", { refetchMs: 8000 });
  const tone = (s: string) => (s === "CONFIRMED" ? "ok" : s === "FAILED" ? "bad" : "info");
  return (
    <>
      <PageHeader title="Settlements" description="Funds swept from invoice addresses to your vault or wallet. The platform fee is taken in the same transaction. The relayer pays the network fee and cannot redirect the funds: the destination and fee are fixed in each invoice contract." />
      <Ledger<any>
        caption="Settlements" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(s) => s.id}
        filter={{ status: (s) => s.status, text: (s) => `${s.payment_intent_id ?? ""} ${s.tx_hash ?? ""} ${s.network}`, placeholder: "Search payment, hash or network" }}
        empty={{ title: "No settlements yet", body: "A settlement is created automatically once funds at an invoice address are final, and it ends with the money in your vault or wallet. Wallet payments go straight there and never need one.", action: <Button variant="primary" asChild><Link href={href("/dashboard/payments")}>See your payments</Link></Button> }}
        columns={[
          { key: "pay", header: "Payment", cell: (s) => <PaymentRef id={s.payment_intent_id} /> },
          {
            key: "st", header: "Status",
            cell: (s) => (
              <div>
                <Chip tone={tone(s.status) as any}>{cap(s.status)}</Chip>
                {s.failure_reason && <p className="mt-1 max-w-56 text-xs text-bad-ink">{s.failure_reason}</p>}
              </div>
            ),
          },
          { key: "net", header: "Network", hideBelow: "lg", cell: (s) => <span className="text-ink-2">{s.network}</span> },
          { key: "tx", header: "Transaction", hideBelow: "md", cell: (s) => (s.tx_hash ? <Hash value={s.tx_hash} href={s.explorer_url} lead={8} tail={4} /> : <span className="text-ink-4">—</span>) },
          {
            key: "fee", header: "Relayer fee", hideBelow: "lg", align: "right",
            cell: (s) => (s.relayer_fee ? <span className="tnum font-mono text-xs text-ink-3">{s.relayer_fee.usdc ? `${s.relayer_fee.usdc} USDC` : `${(Number(s.relayer_fee.native_wei) / 1e18).toFixed(6)} ${s.relayer_fee.native_symbol}`}</span> : <span className="text-ink-4">—</span>),
          },
          { key: "to", header: "Paid to", hideBelow: "lg", cell: (s) => <span className="text-ink-2">{s.destination_kind === "DIRECT" ? "Your wallet" : "Your vault"}</span> },
          { key: "pfee", header: "Platform fee", hideBelow: "md", align: "right", cell: (s) => (s.fee != null ? <Amount value={s.fee} size="sm" symbol={s.currency ?? "USDC"} unit={(s.currency ?? "USDC") !== "USDC"} /> : <span className="text-ink-4">—</span>) },
          { key: "amt", header: "Swept", align: "right", cell: (s) => <Amount value={s.swept_amount ?? s.expected_amount} size="sm" symbol={s.currency ?? "USDC"} unit={(s.currency ?? "USDC") !== "USDC"} /> },
        ]}
      />
    </>
  );
}

export function RefundsView() {
  const href = useHref();
  const q = useApi<any>("/v1/refund-requests", { refetchMs: 8000 });
  const [proofFor, setProofFor] = useState<any>(null);
  const [hash, setHash] = useState("");
  const proof = useAction((id: string) => apiFetch(`/v1/refund-requests/${id}/proof`, { method: "POST", body: { tx_hash: hash } }), { invalidate: ["/v1/refund-requests", "/v1/payments"], success: "Refund verified on-chain", onSuccess: () => { setProofFor(null); setHash(""); } });
  const reject = useAction((id: string) => apiFetch(`/v1/refund-requests/${id}/reject`, { method: "POST" }), { invalidate: ["/v1/refund-requests", "/v1/payments"], success: "Refund request rejected" });
  const hashValid = /^0x[0-9a-fA-F]{64}$/.test(hash);
  return (
    <>
      <PageHeader title="Refund requests" description="A refund is a new transfer from your vault or payout wallet, sent by you. It completes only once that transfer is verified on-chain. The platform fee is not refunded." />
      <Ledger<any>
        caption="Refund requests" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(r) => r.id}
        filter={{ status: (r) => r.status, text: (r) => `${r.id} ${r.payment_intent_id} ${r.recipient}`, placeholder: "Search refund, payment or recipient" }}
        empty={{ title: "No refund requests", body: "Request one from a payment's detail page. You then send the funds from the account that received the payment and paste the transaction hash here as proof.", action: <Button variant="primary" asChild><Link href={href("/dashboard/payments")}>Open a payment</Link></Button> }}
        columns={[
          {
            key: "id", header: "Refund",
            cell: (r) => (
              <div className="min-w-0">
                <span className="inline-flex items-center gap-0.5 font-mono text-xs text-ink"><span title={r.id}>{shortHash(r.id, 12, 4)}</span><CopyButton value={r.id} compact /></span>
                <div><PaymentRef id={r.payment_intent_id} /></div>
              </div>
            ),
          },
          { key: "st", header: "Status", cell: (r) => <Chip tone={r.status === "COMPLETED" ? "ok" : r.status === "REQUESTED" ? "warn" : "neutral"}>{cap(r.status)}</Chip> },
          { key: "to", header: "Recipient", hideBelow: "md", cell: (r) => <Hash value={r.recipient} /> },
          { key: "amt", header: "Amount", align: "right", cell: (r) => <Amount value={r.amount} size="sm" symbol={r.currency ?? "USDC"} unit={(r.currency ?? "USDC") !== "USDC"} /> },
          {
            key: "act", header: "", align: "right",
            cell: (r) =>
              r.status === "REQUESTED" ? (
                <span className="inline-flex gap-1.5">
                  <Button size="sm" onClick={() => setProofFor(r)}>Add proof</Button>
                  <Button size="sm" variant="ghost" loading={reject.isPending && reject.variables === r.id} onClick={() => reject.mutate(r.id)}>Reject</Button>
                </span>
              ) : r.explorer_url ? (
                <a className={`${cellLink} inline-flex items-center gap-1`} href={r.explorer_url} target="_blank" rel="noreferrer noopener">View transaction<ArrowUpRight className="size-3.5" aria-hidden /></a>
              ) : null,
          },
        ]}
      />
      <Dialog open={!!proofFor} onOpenChange={(v) => { if (!v) { setProofFor(null); setHash(""); } }}>
        <DialogContent title="Add refund proof" description={proofFor?.pay_from?.kind === "DIRECT" ? "Send the refund from your payout wallet, then paste the transaction hash." : "Send the refund from your vault with vault.withdraw, then paste the transaction hash."}>
          {proofFor && (
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (hashValid) proof.mutate(proofFor.id); }}>
              <dl className="divide-y divide-line rounded-ctl border border-line px-4">
                <div className="flex items-center justify-between gap-4 py-3 text-sm"><dt className="text-ink-3">Send</dt><dd><Amount value={proofFor.amount} size="md" symbol={proofFor.currency ?? "USDC"} /></dd></div>
                <div className="grid gap-1.5 py-3 text-sm"><dt className="text-ink-3">To</dt><dd><CopyField value={proofFor.recipient} /></dd></div>
                {proofFor.pay_from && <div className="grid gap-1.5 py-3 text-sm"><dt className="text-ink-3">{proofFor.pay_from.kind === "DIRECT" ? "From your payout wallet" : "From your vault"}</dt><dd><CopyField value={proofFor.pay_from.address} /></dd></div>}
              </dl>
              <Field label="Transaction hash" htmlFor="proof-hash" error={hash && !hashValid ? "A transaction hash is 0x followed by 64 hexadecimal characters." : null} hint={`We check the receipt for a ${proofFor?.currency ?? "USDC"} transfer from your ${proofFor?.pay_from?.kind === "DIRECT" ? "payout wallet" : "vault"} to the recipient for exactly this amount.`}>
                <Input id="proof-hash" className="font-mono" value={hash} onChange={(e) => setHash(e.target.value.trim())} placeholder="0x…" aria-invalid={!!hash && !hashValid} autoFocus />
              </Field>
              <Button type="submit" variant="primary" loading={proof.isPending} disabled={!hashValid}>Verify on-chain</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AuditView() {
  const href = useHref();
  const q = useApi<any>("/v1/audit-events?limit=100");
  return (
    <>
      <PageHeader title="Audit log" description="Security-relevant actions by people, API keys, the relayer and the system. Secrets and signatures are never recorded." />
      <Ledger<any>
        caption="Audit log" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(a) => a.id}
        filter={{ status: (a) => a.actor_type, statusLabel: (s) => cap(s), text: (a) => `${a.action} ${a.actor_type} ${a.actor_id ?? ""} ${a.target_type ?? ""} ${a.target_id ?? ""} ${a.ip ?? ""}`, placeholder: "Search action, actor or target" }}
        empty={{ title: "Nothing recorded yet", body: "Account, key, vault and payment actions are listed here the moment they happen, newest first. Create an API key or a payment and it appears within seconds.", action: <Button variant="primary" asChild><Link href={href("/dashboard/developers/api-keys")}>Create an API key</Link></Button> }}
        columns={[
          { key: "t", header: "When", cell: (a) => <span className="tnum whitespace-nowrap font-mono text-xs text-ink-3" title={relativeTime(a.created_at)}>{formatDateTime(a.created_at)}</span> },
          {
            key: "act", header: "Action",
            cell: (a) => {
              const [ns, ...rest] = String(a.action).split(".");
              return rest.length ? <span className="font-mono text-xs"><span className="text-ink-3">{ns}.</span><span className="font-medium text-ink">{rest.join(".")}</span></span> : <span className="font-mono text-xs font-medium text-ink">{a.action}</span>;
            },
          },
          { key: "who", header: "Actor", hideBelow: "md", cell: (a) => <span className="text-ink-2">{cap(a.actor_type)}{a.actor_id && <span className="ml-1.5 font-mono text-xs text-ink-3">{a.actor_id.slice(0, 12)}…</span>}</span> },
          { key: "tgt", header: "Target", hideBelow: "lg", cell: (a) => (a.target_type ? <span className="font-mono text-xs text-ink-3">{a.target_type} {String(a.target_id ?? "").slice(0, 16)}</span> : <span className="text-ink-4">—</span>) },
          { key: "ip", header: "IP", hideBelow: "lg", align: "right", cell: (a) => <span className="font-mono text-xs text-ink-3">{a.ip ?? "—"}</span> },
        ]}
      />
    </>
  );
}
