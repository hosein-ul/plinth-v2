/**
 * Everything an AI coding assistant needs to add Plinth to a project that already exists. The same text feeds /llms.txt,
 * /llms-full.txt, the MCP server and the copy-to-clipboard prompts on /build-with-ai, so they cannot disagree. Facts come from
 * @plinth/shared (the playbook) and the generated OpenAPI document; nothing here describes a feature that does not exist.
 */
import { API_FACTS, INTEGRATION_PLAYBOOK, WEBHOOK_EVENTS, WEBHOOK_VERIFY_NODE } from "@plinth/shared";
import { SITE_URL } from "@/lib/site";

export { API_FACTS };

/** The hosted MCP server. It is part of the Plinth API, so it lives next to it; override with NEXT_PUBLIC_MCP_URL for another deployment. */
export { MCP_URL } from "./config";
import { MCP_URL } from "./config";

export const LLMS_TXT = `# Plinth

> Non-custodial stablecoin payment gateway (USDC, and EURC on Arc). Your app asks for a payment with each order's real total; the customer pays with a wallet or to a unique address; funds settle, minus a 0.20% platform fee, into a vault only the merchant can withdraw from or into the merchant's own payout wallet. Live on Arc mainnet. Contracts have been through a security audit.

## For AI coding assistants
- [Integration playbook and API guide](${SITE_URL}/llms-full.txt): how to add Plinth checkout to an existing project
- [Build with AI](${SITE_URL}/build-with-ai): connect an assistant, or paste one prompt
- OpenAPI 3.1 document: served by a running Plinth API at /v1/openapi.json
- MCP server (hosted, Streamable HTTP): ${MCP_URL}  (header: Authorization: Bearer sk_...). 29 tools: payments, payment links, invoices, refunds, webhooks, reports and get_integration_playbook

## Key facts
${API_FACTS.map((f) => `- ${f}`).join("\n")}

## Two ways to take money
- Payments in an app or site: the app's server creates a payment per order with the real total. Automatic, no links to make by hand.
- Payment links and invoices: one fixed price, shared as a link. No code.

## Status
- Available: REST API, signed webhooks, payment links, invoices, hosted checkout, dashboard, hosted MCP server.
- Planned, not built: published SDKs, starter templates beyond the chat bot.
`;

export const LLMS_FULL = `# Plinth: add USDC payments to a project (plain text for AI assistants)

${INTEGRATION_PLAYBOOK}

## Facts
${API_FACTS.map((f) => `- ${f}`).join("\n")}

## Create a payment for one order
POST /v1/payment-intents
Headers: Authorization: Bearer sk_..., Idempotency-Key: ORDER_ID-1, Content-Type: application/json
Body: {"amount":"25.00","order_reference":"ORDER_ID","success_url":"https://YOUR_DOMAIN/thanks","cancel_url":"https://YOUR_DOMAIN/cart"}
Response includes: id, status, checkout_url, networks[].deposit_address. Redirect the customer to checkout_url.

## Webhook events
${WEBHOOK_EVENTS.map(([e, m, f]) => `- ${e}: ${m}. Fulfil: ${f}.`).join("\n")}
- settlement.submitted / completed / failed and refund.requested / completed are informational.
The event body is JSON: {"id","type","data":{"object":{"id","status","order_reference","amount",...}}}.

## Verify a webhook (Node.js)
${WEBHOOK_VERIFY_NODE}

## Other endpoints
GET /v1/payments, GET /v1/payments/{id}, POST /v1/payment-links, POST /v1/invoices, GET /v1/networks, POST /v1/refund-requests, POST /v1/webhook-endpoints.
Errors: {"error":{"type","code","message","request_id"}}. 400 validation, 401/403 auth, 404, 409 conflict, 422 semantic, 429 rate limited.
`;

export interface Scenario { id: string; label: string; blurb: string; extra: string }

/** One master prompt, specialised by what the existing project is. Nothing here asks an assistant to build a project from scratch. */
export const SCENARIOS: Scenario[] = [
  { id: "store", label: "Online store", blurb: "An existing shop with a cart or checkout.", extra: "This is an online store. The payment is created when the customer clicks the final pay or place-order button, with the cart total computed from the product prices stored on the server." },
  { id: "saas", label: "SaaS or membership", blurb: "Plans, upgrades or paid access.", extra: "This is a SaaS or membership product. The payment is created when someone buys or renews a plan; after payment.confirmed, activate the plan and store its expiry." },
  { id: "bot", label: "Chat bot or Mini App", blurb: "A bot or Mini App that sells something.", extra: "This is a chat bot or Mini App. When a user taps buy, the bot's SERVER creates the payment (order_reference = chat or user id + item) and replies with a button that opens checkout_url. On payment.confirmed, deliver the item or grant access and message the buyer." },
  { id: "booking", label: "Bookings", blurb: "Appointments, tickets, classes.", extra: "This is a booking product. Hold the slot as pending when the payment is created; confirm it on payment.confirmed, and release it if the payment expires." },
];

export function buildPrompt(s: Scenario): string {
  return `Add Plinth USDC payments to THIS project. Do not create a new project and do not make payment links by hand.

${s.extra}

If a Plinth MCP server is connected, call get_integration_playbook first and follow it, and use create_payment / get_payment to test.
Otherwise read ${SITE_URL}/llms-full.txt and follow the playbook there.

Work in this order and tell me what you found before you change anything:
1. Find where an order, cart, booking or plan is created and where prices come from.
2. Add the server-side payment creation, the redirect to checkout_url, and the webhook route with signature verification.
3. Add PLINTH_API_URL, PLINTH_SECRET_KEY and PLINTH_WEBHOOK_SECRET to the project's env template (and document them there). Keep the secret key server-side.
4. Test it with a small real order: the order total is charged, the order flips to paid from the webhook only, a bad signature is rejected, a replayed event is ignored.
5. Finish with a short list: files changed, env vars to set, how to run the test.`;
}
