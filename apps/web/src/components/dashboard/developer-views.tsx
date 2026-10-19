"use client";
import { useState } from "react";
import { Plus, RotateCw } from "lucide-react";
import { Chip } from "@/components/badge";
import { CopyButton } from "@/components/copy-button";
import { ErrorState, PageHeader, Section, Skeleton } from "@/components/page";
import { Code, C } from "@/components/marketing/code";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import Link from "next/link";
import { useHref } from "@/lib/data-source";
import { cap, CheckRow, ConfirmDialog, Ledger, SecretReveal } from "./parts-account";


import { PUBLIC_API_URL } from "@/lib/config";
export function ApiKeysView() {
  const q = useApi<any>("/v1/api-keys");
  const me = useApi<any>("/v1/me");
  const env = (me.data?.environment ?? "test") as "test" | "live";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<any>(null);
  const [revoking, setRevoking] = useState<any>(null);
  const create = useAction(() => apiFetch<any>("/v1/api-keys", { method: "POST", body: { name, environment: env } }), { invalidate: ["/v1/api-keys"], onSuccess: setFresh });
  const rotate = useAction((id: string) => apiFetch<any>(`/v1/api-keys/${id}/rotate`, { method: "POST" }), { invalidate: ["/v1/api-keys"], onSuccess: (o) => { setFresh(o); setOpen(true); } });
  const revoke = useAction((id: string) => apiFetch(`/v1/api-keys/${id}`, { method: "DELETE" }), { invalidate: ["/v1/api-keys"], success: "Key revoked", onSuccess: () => setRevoking(null) });
  const api = PUBLIC_API_URL;
  const snippet = `curl -X POST ${api || "$PLINTH_API"}/v1/payment-intents \\
  -H "Authorization: Bearer sk_${env}_…" \\
  -H "Idempotency-Key: ORDER_ID" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"25.00","order_reference":"ORDER_ID"}'`;
  return (
    <>
      <PageHeader
        title="API keys" description={`Secret keys authenticate your server. ${env === "test" ? "Test keys never move real funds." : "Live keys move real funds."} Keys are stored hashed and shown once.`}
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFresh(null); setName(""); } }}>
            <DialogTrigger asChild><Button variant="primary"><Plus className="size-4" aria-hidden />New {env} key</Button></DialogTrigger>
            <DialogContent title={fresh ? "Copy your key now" : `New ${env} key`} description={fresh ? undefined : "Give it a name that says where it will run."}>
              {fresh ? (
                <SecretReveal title={`${fresh.name} · ${fresh.environment}`} value={fresh.key} note="This is the only time the full key is shown. Store it in your secrets manager before closing this window." />
              ) : (
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(undefined); }}>
                  <Field label="Name" htmlFor="ak-name" hint="Where this key will be used, e.g. “checkout backend”."><Input id="ak-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
                  <div className="flex justify-end"><Button type="submit" variant="primary" disabled={!name.trim()} loading={create.isPending}>Create key</Button></div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <Ledger<any>
        caption="API keys" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(k) => k.id}
        empty={{
          title: "No API keys",
          body: "Create a key to call the API from your server. The full key is shown once, so have your secrets manager open.",
          action: <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New {env} key</Button>,
        }}
        columns={[
          {
            key: "n", header: "Name",
            cell: (k) => (
              <div className="min-w-0">
                <p className={cn("truncate font-medium", k.revoked_at ? "text-ink-3" : "text-ink")}>{k.name}</p>
                <span className="inline-flex items-center gap-0.5 font-mono text-xs text-ink-3">{k.prefix}…<CopyButton value={k.prefix} compact label="Copy prefix" /></span>
              </div>
            ),
          },
          { key: "env", header: "Mode", hideBelow: "sm", cell: (k) => <Chip tone={k.environment === "live" ? "warn" : "neutral"} dot={false}>{cap(k.environment)}</Chip> },
          { key: "created", header: "Created", hideBelow: "lg", cell: (k) => <span className="text-ink-3" title={formatDateTime(k.created_at)}>{k.created_at ? relativeTime(k.created_at) : "—"}</span> },
          { key: "used", header: "Last used", hideBelow: "md", cell: (k) => <span className="text-ink-3">{k.last_used_at ? relativeTime(k.last_used_at) : "Never"}</span> },
          { key: "st", header: "Status", cell: (k) => (k.revoked_at ? <Chip tone="bad">Revoked</Chip> : <Chip tone="neutral">Active</Chip>) },
          {
            key: "act", header: "", align: "right",
            cell: (k) =>
              !k.revoked_at && (
                <span className="inline-flex gap-1">
                  <Button size="sm" variant="ghost" loading={rotate.isPending && rotate.variables === k.id} onClick={() => rotate.mutate(k.id)}><RotateCw className="size-3.5" aria-hidden />Rotate</Button>
                  <Button size="sm" variant="danger" onClick={() => setRevoking(k)}>Revoke</Button>
                </span>
              ),
          },
        ]}
      />
      <ConfirmDialog
        open={!!revoking} onOpenChange={(v) => !v && setRevoking(null)}
        title={revoking ? `Revoke “${revoking.name}”?` : "Revoke key"}
        description="Requests using this key will fail immediately. This cannot be undone; create a new key to replace it."
        confirmLabel="Revoke key" loading={revoke.isPending} onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
      <Section bare title="Quickstart" description="Create a payment with a retry-safe idempotency key." className="mt-10" actions={<CopyButton value={snippet} label="Copy snippet" />}>
        <Code label="curl">{snippet}</Code>
        <p className="mt-3 max-w-2xl text-sm text-ink-3">The response contains <C>checkout_url</C> and a deposit address per network. Fulfil orders from the signed <C>payment.confirmed</C> / <C>payment.completed</C> webhook, never from the redirect.</p>
      </Section>
    </>
  );
}

const EVENTS = ["payment.detected", "payment.confirmed", "payment.completed", "payment.underpaid", "payment.overpaid", "payment.expired", "payment.late", "payment.invalid_asset", "settlement.submitted", "settlement.completed", "settlement.failed", "refund.requested", "refund.completed"];
const EVENT_GROUPS = ["payment", "settlement", "refund"].map((g) => ({ group: g, events: EVENTS.filter((e) => e.startsWith(`${g}.`)) }));

export function WebhooksView() {
  const q = useApi<any>("/v1/webhook-endpoints");
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [all, setAll] = useState(true);
  const [sel, setSel] = useState<string[]>([]);
  const [fresh, setFresh] = useState<any>(null);
  const [disabling, setDisabling] = useState<any>(null);
  const create = useAction(() => apiFetch<any>("/v1/webhook-endpoints", { method: "POST", body: { url, events: all ? ["*"] : sel } }), { invalidate: ["/v1/webhook-endpoints"], onSuccess: setFresh });
  const disable = useAction((id: string) => apiFetch(`/v1/webhook-endpoints/${id}`, { method: "DELETE" }), { invalidate: ["/v1/webhook-endpoints"], success: "Endpoint disabled", onSuccess: () => setDisabling(null) });
  const urlOk = /^https?:\/\//.test(url);
  return (
    <>
      <PageHeader
        title="Webhooks" description="Signed, retried and logged. Your handler must be idempotent: deduplicate on the event id."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setFresh(null); setUrl(""); setAll(true); setSel([]); } }}>
            <DialogTrigger asChild><Button variant="primary"><Plus className="size-4" aria-hidden />Add endpoint</Button></DialogTrigger>
            <DialogContent title={fresh ? "Signing secret" : "Add webhook endpoint"} description={fresh ? undefined : "We send a signed POST to this URL for each event you choose."} className="w-[min(92vw,38rem)]">
              {fresh ? (
                <SecretReveal title="Signing secret" value={fresh.secret} note="Use it to verify the Plinth-Signature header on every request. It cannot be shown again." />
              ) : (
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined); }}>
                  <Field label="Endpoint URL" htmlFor="wh-url" hint="HTTPS only. Private network addresses are rejected."><Input id="wh-url" type="url" className="font-mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/plinth" autoFocus /></Field>
                  <fieldset>
                    <legend className="mb-1.5 text-sm font-medium text-ink">Events</legend>
                    <CheckRow checked={all} onChange={setAll} className="-mx-2">All events <span className="text-ink-3">(recommended)</span></CheckRow>
                    {!all && (
                      <div className="mt-3 grid gap-x-4 gap-y-4 sm:grid-cols-3">
                        {EVENT_GROUPS.map((g) => (
                          <div key={g.group}>
                            <p className="label mb-1 px-0.5 capitalize">{g.group}</p>
                            {g.events.map((ev) => (
                              <CheckRow key={ev} mono className="-mx-2" checked={sel.includes(ev)} onChange={(v) => setSel(v ? [...sel, ev] : sel.filter((x) => x !== ev))}>{ev.slice(g.group.length + 1)}</CheckRow>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {!all && <p className="mt-3 text-xs text-ink-3" role="status">{sel.length === 0 ? "Select at least one event." : `${sel.length} selected`}</p>}
                  </fieldset>
                  <div className="flex justify-end"><Button type="submit" variant="primary" disabled={!urlOk || (!all && sel.length === 0)} loading={create.isPending}>Create endpoint</Button></div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <Ledger<any>
        caption="Webhook endpoints" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(w) => w.id}
        empty={{
          title: "No webhook endpoints",
          body: "Add an HTTPS endpoint to be told, with a signed request, when a payment is detected, confirmed or settled. Each request is a POST with a JSON event and a Plinth-Signature header.",
          action: <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />Add endpoint</Button>,
        }}
        columns={[
          {
            key: "u", header: "Endpoint",
            cell: (w) => (
              <div className="min-w-0 py-2">
                <p className="break-all font-mono text-xs leading-5 text-ink">{w.url}</p>
                <p className="text-xs text-ink-3">{w.events.includes("*") ? "All events" : `${w.events.length} ${w.events.length === 1 ? "event" : "events"}`}</p>
              </div>
            ),
          },
          { key: "m", header: "Mode", hideBelow: "sm", cell: (w) => <Chip tone={w.livemode ? "warn" : "neutral"} dot={false}>{w.livemode ? "Live" : "Test"}</Chip> },
          { key: "c", header: "Created", hideBelow: "lg", cell: (w) => <span className="text-ink-3" title={w.created_at ? formatDateTime(w.created_at) : undefined}>{w.created_at ? relativeTime(w.created_at) : "—"}</span> },
          {
            key: "s", header: "Status",
            cell: (w) => (
              <div>
                <Chip tone={w.status !== "ACTIVE" ? "neutral" : w.consecutive_failures > 0 ? "warn" : "ok"}>{cap(w.status)}</Chip>
                {w.consecutive_failures > 0 && <p className="mt-1 text-xs font-medium text-warn-ink">{w.consecutive_failures} failures in a row</p>}
              </div>
            ),
          },
          { key: "a", header: "", align: "right", cell: (w) => w.status === "ACTIVE" && <Button size="sm" variant="ghost" onClick={() => setDisabling(w)}>Disable</Button> },
        ]}
      />
      <ConfirmDialog
        open={!!disabling} onOpenChange={(v) => !v && setDisabling(null)}
        title="Disable this endpoint?"
        description={disabling ? <>Plinth stops sending events to <span className="break-all font-mono text-xs text-ink">{disabling.url}</span>. Create a new endpoint to start again.</> : ""}
        confirmLabel="Disable endpoint" loading={disable.isPending} onConfirm={() => disabling && disable.mutate(disabling.id)}
      />
      <Section bare title="Verify the signature" description="Every request carries Plinth-Signature: t=<unix>,v1=<hex>." className="mt-10" actions={<CopyButton value={VERIFY} label="Copy snippet" />}>
        <Code label="node">{VERIFY}</Code>
      </Section>
    </>
  );
}

const VERIFY = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret, rawBody, header) {
  const p = Object.fromEntries(header.split(",").map((s) => s.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false; // replay window
  const mac = createHmac("sha256", secret).update(p.t + "." + rawBody).digest();
  const got = Buffer.from(p.v1, "hex");
  return mac.length === got.length && timingSafeEqual(mac, got);
}`;

export function WebhookLogsView() {
  const href = useHref();
  const q = useApi<any>("/v1/webhook-deliveries?limit=100", { refetchMs: 6000 });
  const [view, setView] = useState<any>(null);
  const attempts = useApi<any>(view ? `/v1/webhook-deliveries/${view.id}/attempts` : null);
  const retry = useAction((id: string) => apiFetch(`/v1/webhook-deliveries/${id}/retry`, { method: "POST" }), { invalidate: ["/v1/webhook-deliveries"], success: "Retry scheduled" });
  const tone = (s: string) => (s === "SUCCEEDED" ? "ok" : s === "ABANDONED" ? "bad" : s === "RETRYING" ? "warn" : "info");
  return (
    <>
      <PageHeader title="Webhook logs" description="Every delivery attempt: status, latency and what your server answered. Select a row for its attempts." />
      <Ledger<any>
        caption="Webhook deliveries" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(d) => d.id} onRowClick={setView}
        filter={{ status: (d) => d.status, text: (d) => `${d.eventType} ${d.endpointUrl} ${d.lastStatusCode ?? ""}`, placeholder: "Search event, endpoint or HTTP code" }}
        empty={{ title: "No deliveries yet", body: "Deliveries appear here as soon as an event is sent to one of your endpoints, with every retry and your server's answer. Add an endpoint, then create a test payment to produce the first event.", action: <Button variant="primary" asChild><Link href={href("/dashboard/developers/webhooks")}>Add a webhook endpoint</Link></Button> }}
        columns={[
          { key: "ev", header: "Event", cell: (d) => <span className="font-mono text-xs font-medium text-ink">{d.eventType}</span> },
          { key: "st", header: "Status", cell: (d) => <Chip tone={tone(d.status) as any} pulse={d.status === "RETRYING"}>{cap(d.status)}</Chip> },
          { key: "code", header: "HTTP", hideBelow: "sm", cell: (d) => <span className={cn("tnum font-mono text-xs", d.lastStatusCode && d.lastStatusCode >= 400 ? "text-bad-ink" : "text-ink-2")}>{d.lastStatusCode ?? "—"}</span> },
          { key: "att", header: "Attempts", hideBelow: "md", align: "right", cell: (d) => <span className="tnum font-mono text-xs text-ink-2">{d.attempts}</span> },
          { key: "ep", header: "Endpoint", hideBelow: "lg", cell: (d) => <span className="block max-w-72 truncate font-mono text-xs text-ink-3" title={d.endpointUrl}>{d.endpointUrl}</span> },
          { key: "when", header: "When", hideBelow: "md", cell: (d) => <span className="text-ink-3" title={formatDateTime(d.createdAt)}>{relativeTime(d.createdAt)}</span> },
          {
            key: "act", header: "", align: "right",
            cell: (d) => d.status !== "SUCCEEDED" && (
              <Button size="sm" variant="ghost" loading={retry.isPending && retry.variables === d.id} onClick={(e) => { e.stopPropagation(); retry.mutate(d.id); }} onKeyDown={(e) => e.stopPropagation()}><RotateCw className="size-3.5" aria-hidden />Retry</Button>
            ),
          },
        ]}
      />
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        {view && (
          <DialogContent title={view.eventType} description={`Delivery ${view.id}`} className="w-[min(94vw,38rem)]">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Chip tone={tone(view.status) as any}>{cap(view.status)}</Chip>
              <span className="min-w-0 break-all font-mono text-xs text-ink-3">{view.endpointUrl}</span>
            </div>
            {attempts.error ? (
              <ErrorState error={attempts.error} retry={() => attempts.refetch()} />
            ) : attempts.isLoading ? (
              <div className="space-y-3" aria-hidden><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
            ) : (
              <ol className="divide-y divide-line border-y border-line">
                {(attempts.data?.data ?? []).map((a: any) => (
                  <li key={a.attempt} className="py-3.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">Attempt {a.attempt}</span>
                      <Chip tone={a.error ? "bad" : "ok"} className="font-mono">{a.status_code ?? "no response"}{a.duration_ms != null ? ` · ${a.duration_ms}ms` : ""}</Chip>
                    </div>
                    <p className="mt-0.5 font-mono text-2xs text-ink-3">{formatDateTime(a.at)}</p>
                    {a.error && <p className="mt-1.5 text-xs text-bad-ink">{a.error}</p>}
                    {a.response_snippet && <pre className="mt-2 overflow-x-auto rounded-ctl bg-wash p-3 font-mono text-xs text-ink-2">{a.response_snippet}</pre>}
                  </li>
                ))}
                {attempts.data && attempts.data.data.length === 0 && <li className="py-4 text-sm text-ink-3">Not attempted yet.</li>}
              </ol>
            )}
            {view.status !== "SUCCEEDED" && (
              <div className="mt-5 flex justify-end">
                <Button variant="primary" loading={retry.isPending} onClick={() => { retry.mutate(view.id); setView(null); }}><RotateCw className="size-4" aria-hidden />Retry now</Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
