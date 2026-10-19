import type { EmailMessage } from "./email";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One plain, readable layout for every message: text first, a single button, no tracking pixels. */
function layout(opts: { title: string; lines: string[]; action?: { label: string; url: string }; footer?: string }): { text: string; html: string } {
  const text = [opts.title, "", ...opts.lines, ...(opts.action ? ["", `${opts.action.label}: ${opts.action.url}`] : []), "", opts.footer ?? "If you did not expect this email, you can ignore it.", "", "Plinth"].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#10162b">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(opts.title)}</h1>
${opts.lines.map((l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${esc(l)}</p>`).join("\n")}
${opts.action ? `<p style="margin:24px 0"><a href="${esc(opts.action.url)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;display:inline-block">${esc(opts.action.label)}</a></p><p style="font-size:13px;color:#52597a;margin:0 0 12px;word-break:break-all">${esc(opts.action.url)}</p>` : ""}
<p style="font-size:13px;color:#52597a;margin:24px 0 0">${esc(opts.footer ?? "If you did not expect this email, you can ignore it.")}</p>
</div></body></html>`;
  return { text, html };
}

const mk = (to: string, subject: string, body: ReturnType<typeof layout>, tag: string, key?: string): EmailMessage => ({
  to, subject, text: body.text, html: body.html, tags: { type: tag }, ...(key ? { idempotencyKey: key } : {}),
});

export function verifyEmailMessage(to: string, link: string, hours: number, key: string): EmailMessage {
  return mk(to, "Confirm your email for Plinth", layout({ title: "Confirm your email", lines: [`Use this link to confirm that ${to} is yours. It works once and expires in ${hours} hours.`], action: { label: "Confirm email", url: link } }), "verify_email", key);
}

export function emailChangedNotice(to: string, newEmail: string): EmailMessage {
  return mk(to, "The email on your Plinth account was changed", layout({ title: "Your account email was changed", lines: [`The email address on your Plinth account was changed to ${newEmail}.`, "If this was not you, sign in and review your account right away."] }), "email_changed");
}

export interface PayoutChangeDetails {
  network: string;
  mode: "VAULT" | "DIRECT" | "CUSTODIAL";
  address: string | null;
  cooldownHours: number;
}

const describe = (d: PayoutChangeDetails) =>
  d.mode === "DIRECT" ? `pay straight to the wallet ${d.address}` : d.mode === "CUSTODIAL" ? `be held by Plinth for you, with withdrawals to the wallet ${d.address}` : "pay into your Plinth vault";

export function payoutConfirmMessage(to: string, link: string, d: PayoutChangeDetails, hours: number, key: string): EmailMessage {
  const lines = [
    `Someone asked to change how new payments on ${d.network} are paid out: ${describe(d)}.`,
    "Nothing changes until you confirm with the button below. Invoices that already have an address keep the destination they were issued with.",
    d.cooldownHours > 0 ? `After you confirm, the change starts applying to new invoices ${d.cooldownHours} hours later, so there is time to stop it if it was not you.` : "After you confirm, it applies to new invoices right away.",
    `The link works once and expires in ${hours} hours.`,
  ];
  return mk(to, "Confirm your Plinth payout change", layout({ title: "Confirm a payout change", lines, action: { label: "Confirm payout change", url: link }, footer: "If this was not you, do not click the link. Your funds are not affected unless you confirm." }), "payout_confirm", key);
}

export function payoutChangedNotice(to: string, d: PayoutChangeDetails & { event: "confirmed" | "requested" | "cancelled" | "switched_to_vault" }): EmailMessage {
  const titles = {
    requested: "A payout change was requested",
    confirmed: "A payout change was confirmed",
    cancelled: "A payout change was cancelled",
    switched_to_vault: "Payouts were switched back to your vault",
  } as const;
  const lines =
    d.event === "confirmed"
      ? [`Payouts on ${d.network} will ${describe(d)} for new invoices${d.cooldownHours > 0 ? `, starting ${d.cooldownHours} hours after the confirmation` : ""}.`, "If this was not you, sign in now and switch back to your vault."]
      : d.event === "switched_to_vault"
        ? [`New invoices on ${d.network} now pay into your Plinth vault.`]
        : d.event === "cancelled"
          ? [`A pending payout change on ${d.network} was cancelled.`]
          : [`A change to ${describe(d)} on ${d.network} was requested and is waiting for confirmation by email.`];
  return mk(to, titles[d.event], layout({ title: titles[d.event], lines }), `payout_${d.event}`);
}

export interface CustodyWithdrawalDetails {
  network: string;
  token: string;
  amount: string;
  address: string;
  event: "requested" | "confirmed" | "failed";
  txHash?: string | null;
}

export function custodyWithdrawalNotice(to: string, d: CustodyWithdrawalDetails): EmailMessage {
  const titles = { requested: "A custody withdrawal was requested", confirmed: "A custody withdrawal was sent", failed: "A custody withdrawal failed and was credited back" } as const;
  const lines =
    d.event === "requested"
      ? [`A withdrawal of ${d.amount} ${d.token} on ${d.network} to ${d.address} was requested.`, "If this was not you, sign in now, change your password and contact support."]
      : d.event === "confirmed"
        ? [`${d.amount} ${d.token} was sent to ${d.address} on ${d.network}.`, ...(d.txHash ? [`Transaction: ${d.txHash}`] : [])]
        : [`The withdrawal of ${d.amount} ${d.token} to ${d.address} on ${d.network} could not be completed. The amount is back in your custody balance.`];
  return mk(to, titles[d.event], layout({ title: titles[d.event], lines }), "custody_withdrawal");
}

export function teamChangeNotice(to: string, d: { event: "added" | "role_changed" | "removed"; member: string; role: string }): EmailMessage {
  const titles = { added: "A team member was added", role_changed: "A team member's role was changed", removed: "A team member was removed" } as const;
  const lines =
    d.event === "added"
      ? [`${d.member} was added to your Plinth team as ${d.role}.`, "If this was not you, sign in now, remove that member and change your password."]
      : d.event === "role_changed"
        ? [`The role of ${d.member} was changed to ${d.role}.`, "If this was not you, sign in now and review your team."]
        : [`${d.member} was removed from your Plinth team.`];
  return mk(to, titles[d.event], layout({ title: titles[d.event], lines }), `team_${d.event}`);
}
