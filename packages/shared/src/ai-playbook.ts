/**
 * The one source of truth for how an AI coding assistant should add Plinth to a project. It feeds the MCP server, the
 * /llms.txt files and the copy-and-paste prompts on the website, so they cannot drift apart.
 */

export const API_FACTS = [
  "Base path /v1. Authenticate with `Authorization: Bearer sk_...` (your secret key). Keys are shown once.",
  "Amounts are decimal strings in the payment's token (\"25.00\", at most 6 decimals). The token is USDC unless `currency` says otherwise (EURC is available on Arc). Never use floating point.",
  "The platform fee (0.20% by default, never above 1%) is taken from each settled payment in the same transaction. A payment shows `fee_amount` and `net_amount`; `amount` is what the customer pays.",
  "Send an `Idempotency-Key` header on every create. The same key and body returns the original response.",
  "Create a payment with `POST /v1/payment-intents` ({\"amount\",\"order_reference\",\"success_url\",\"cancel_url\"}). Redirect the customer to `checkout_url`.",
  "Never fulfil an order from a redirect. Fulfil from the signed webhook `payment.confirmed` (fast) or `payment.completed` (strict).",
  "Verify `Plinth-Signature: t=<unix>,v1=<hex>`: v1 = HMAC-SHA256(secret, \"<t>.<rawBody>\"). Reject if |now - t| > 300 s. Deduplicate on event.id.",
  "Read a payment with `GET /v1/payments/{id}` (timeline, transactions, settlements, refunds).",
  "The secret API key must stay on the server. Never put it in browser code, a mobile app bundle or a Mini App bundle.",
] as const;

export const INTEGRATION_PLAYBOOK = `# Add Plinth USDC payments to an existing project

Goal: when a customer commits to pay, charge the REAL total of that order automatically. Do not create payment links by hand for each
product, and do not build a new shop. Work inside the project that already exists.

## Steps
1. Inspect the project. Find the framework, where an order, cart, booking or subscription is created, and where prices come from.
   Say what you found before changing anything.
2. Add server-side environment variables: PLINTH_API_URL, PLINTH_SECRET_KEY (your secret key) and PLINTH_WEBHOOK_SECRET.
   Document them in the project's .env.example. Never print them and never send them to the browser.
3. Where the customer commits to pay, add SERVER code that calls POST /v1/payment-intents:
   - amount: the total computed ON THE SERVER from your own prices (never trust a price sent by the browser), as a string like "25.00"
   - order_reference: your order id
   - success_url and cancel_url: your own pages
   - Idempotency-Key header: the order id plus an attempt number, so a double click does not create two payments
   Save the returned payment id on the order, mark the order "pending payment", then redirect the customer to checkout_url.
4. Add a webhook route. Read the RAW body, verify the Plinth-Signature header, reject stale timestamps, ignore event ids you have seen,
   and on "payment.confirmed" mark the order paid and fulfil it. Return 2xx only after your own work succeeded, so Plinth retries otherwise.
5. Make the thank-you page show the order status from YOUR database. The success_url redirect is not proof of payment.
6. Test with a small real order: create an order, pay it, watch the order flip to paid from the webhook only. Then send a webhook with a bad
   signature (must be rejected) and replay a real one (must be ignored).
7. Report: the files you changed, the environment variables to set, and how to run the test.

## Rules
- Plinth is live on Arc mainnet, so use a small amount while testing. Keep the secret key on the server.
- Amounts are strings, never floats. Prices are decided on the server.
- Fulfil only from the verified webhook. Never from a redirect, a client call or a screenshot.
- If a Plinth MCP server is connected, use its tools (create_payment, get_payment, list_payments) to create and check payments yourself.
`;

export const WEBHOOK_VERIFY_NODE = `import { createHmac, timingSafeEqual } from "node:crypto";

/** rawBody must be the exact bytes received, before any JSON parsing. */
export function verifyPlinthSignature(rawBody: string, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(nowSeconds - t) > 300) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(t + "." + rawBody).digest("hex"), "hex");
  const got = Buffer.from(parts.v1, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}`;

export const WEBHOOK_EVENTS = [
  ["payment.detected", "transfer seen and verified, not final", "no"],
  ["payment.confirmed", "final funds satisfy the amount", "yes (fast)"],
  ["payment.completed", "funds settled to the merchant (vault or payout wallet), net of the platform fee", "yes (strict)"],
  ["payment.underpaid / payment.expired / payment.late", "partial at expiry / nothing / final after expiry", "no"],
  ["payment.overpaid", "excess received (excess_amount); refundable", "yes"],
  ["payment.invalid_asset", "a token other than the payment's official token was sent and is ignored", "no"],
] as const;
