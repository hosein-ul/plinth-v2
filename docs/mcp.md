# Plinth MCP server

The Plinth MCP (Model Context Protocol) server lets an AI assistant add Plinth checkout to **your existing project** and run your payments for you in plain
English: read the integration playbook, create and read payments, payment links and invoices, record refunds, manage webhooks and read reports.

**It is hosted. You add one URL and your key; you install nothing.**

```
https://plinth-api.zerolayer.online/mcp
```

The URL is where the production API runs (the MCP server is served by the same service, at `/mcp`). For another deployment, use `https://<your-api-host>/mcp`.
Transport: **Streamable HTTP**, stateless (every request is independent; nothing is stored between calls).

> **Availability:** `/mcp` is part of the API release that added it. It answers only after that API version is deployed to the host above.

## Connect

You need a Plinth **secret key**: dashboard, Developers, API keys. Send it as a Bearer token.

**Claude Code**

```bash
claude mcp add --transport http plinth https://plinth-api.zerolayer.online/mcp --header "Authorization: Bearer sk_test_..."
```

**Cursor, Claude Desktop, and any client with a remote-server config**

```json
{
  "mcpServers": {
    "plinth": {
      "url": "https://plinth-api.zerolayer.online/mcp",
      "headers": { "Authorization": "Bearer sk_test_..." }
    }
  }
}
```

Keep the key in the client's settings or your secret store. Never paste it into a chat, commit it, or put it in browser code.

## What the key allows

The server calls the Plinth API **as you**, with the key you sent. It has exactly that key's rights, the same rate limits, the same idempotency and the same
environment: a `sk_test_` key only ever sees test data, a `sk_live_` key only live data.
Nothing is cached or logged by the MCP layer.

**There is deliberately no tool that changes where money goes, creates keys or changes the team.** No payout wallets, no vault or custody settings,
no custody withdrawals, no API-key or team management. Those need a signed-in person in the dashboard.

## Tools (29)

Read-only tools are marked **R**.

| Tool | | What it does |
| --- | --- | --- |
| `get_integration_playbook` | R | **Read this first.** The step-by-step instructions and rules for adding Plinth to an existing project |
| `get_webhook_verifier` | R | Node.js code that verifies the `Plinth-Signature` header on the raw body; adapt it to your language |
| `get_account` | R | The merchant, environment (test or live) and rights this key acts with |
| `list_networks` | R | Networks and tokens (USDC; EURC on Arc), whether each is enabled, vault status, the platform fee that applies |
| `create_payment` | | Create a payment for one order; returns `checkout_url` |
| `get_payment` | R | One payment: status, timeline, transactions, settlements, refunds, fee and net amounts, payout route |
| `list_payments` | R | Recent payments, newest first; optional `status` filter |
| `create_payment_link` | | A reusable link for ONE fixed price (a donation, a single service) |
| `list_payment_links` | R | Links with URL, amount, token, active flag |
| `get_payment_link` | R | One link |
| `set_payment_link_active` | | Pause or resume a link |
| `create_invoice` | | A numbered invoice with exact line-item totals |
| `list_invoices` | R | Invoices with payment status |
| `get_invoice` | R | One invoice with its line items and payment |
| `request_refund` | | Record a refund request. **Moves no money**: you send the transfer yourself; at most the net amount (after the fee) |
| `submit_refund_proof` | | Attach the refund transaction hash; completes only after the receipt is verified on-chain |
| `list_refunds` | R | Refund requests and their status |
| `get_refund` | R | One refund, including the account it must be sent from |
| `list_webhook_endpoints` | R | URLs that receive signed events |
| `create_webhook_endpoint` | | Register an https URL. The signing secret (`whsec_...`) is returned **once** |
| `delete_webhook_endpoint` | | Stop sending to an endpoint |
| `list_webhook_deliveries` | R | Recent deliveries and their status, to debug an integration |
| `retry_webhook_delivery` | | Resend a failed delivery |
| `get_overview` | R | Received (final), pending, platform fee, refunded and settled for one token over N days |
| `list_transactions` | R | Detected and settled transfers with chain, hash, finality, token |
| `list_settlements` | R | Sweeps that delivered payments, with amount, fee and net |
| `get_payout_methods` | R | How you are paid per network (vault, direct wallet or custodial), the fee and any change waiting |
| `get_custody` | R | Custody balances, pending withdrawals and withdrawal wallet, where an operator enabled custody |
| `get_settlement_policy` | R | Underpayment and overpayment handling, default expiry, each vault's on-chain rules |

### Inputs worth knowing

* **`amount`** is a decimal **string** in the payment's token with at most 6 decimals, for example `"25.00"`. A number is rejected before any call is made. Compute it on the server from your own prices.
* **`currency`** is `USDC` (default) or `EURC` (Arc only).
* **`create_payment`**: `amount`, `currency`, `order_reference`, `description`, `customer_email`, `success_url`, `cancel_url`, `expires_in_seconds` (300 to 2,592,000; the default is 20 minutes),
  `metadata` (up to 20 string pairs, echoed in webhooks) and `idempotency_key` (reuse it to get the same payment back; `order_reference` is used when you give none).
* **`create_invoice`**: `customer_name`, `customer_email`, `line_items[{description, quantity, unit_amount}]`, `currency`, `memo`, `due_in_days`, `idempotency_key`.
* **`create_webhook_endpoint`**: `url` (https), `events` (default `*`), `description`.
* List tools take `limit` (1 to 100, default 20).

### Resources and prompt

* Resources `plinth://playbook` and `plinth://webhook-verifier`: the same text as the two guidance tools.
* Prompt `add_plinth_checkout`: a ready instruction that tells the assistant to read the playbook and add server-side payments, a verified webhook and an order status page to the project it is in.

## What the assistant should do (the playbook in short)

1. Inspect the project and say what it found (framework, where an order is created, where prices come from).
2. Add server-side variables `PLINTH_API_URL`, `PLINTH_SECRET_KEY` (a test key while building) and `PLINTH_WEBHOOK_SECRET`; document them in `.env.example`; never print them or send them to the browser.
3. At the moment a customer commits to pay, call the API (or `create_payment`) **from the server** with the real total, then redirect to `checkout_url`.
4. Add a webhook route that reads the **raw** body, verifies `Plinth-Signature`, rejects timestamps older than five minutes, ignores event ids it has seen, and fulfils on `payment.confirmed` (fast) or `payment.completed` (strict).
5. Show order status from **your database**, never from the redirect.
6. Test: pay an order and watch it flip to paid from the webhook only; send a bad signature (must be rejected); replay a real event (must be ignored).

(The code your project runs calls the REST API; see [api-guide.md](api-guide.md). The MCP server is how the assistant itself works with your Plinth account while building.)

## What the money does (so the assistant explains it correctly)

* The customer pays the amount on the invoice in the payment's token. The platform fee (0.20% by default, never above 1%) is taken inside the settlement transaction: `amount` is what the customer pays, `fee_amount` the fee, `net_amount` what you receive.
* The net amount reaches your **vault**, your own **payout wallet**, or, where an operator enabled it, your **custody balance**. See [architecture.md](architecture.md).
* Plinth is live on **Arc mainnet** and real funds move. The contracts are not independently audited, so start with small amounts.

## Errors

A failed call returns an MCP tool error whose text is `Plinth <status>: <code and message>`.

| Status | Meaning |
| --- | --- |
| 401 | Missing, unknown or revoked key. Without a key the endpoint itself answers HTTP 401 with `WWW-Authenticate: Bearer` |
| 403 | The key lacks the right for that action |
| 400 | Validation: the message names the field |
| 404 | No such object for this account |
| 409 | Conflict, for example the same idempotency key with a different body |
| 422 | The action is not possible in the current state |
| 429 | Rate limited (per key, 600 requests per minute) |

`GET` and `DELETE` on `/mcp` return `405`: the server is stateless, send JSON-RPC requests with `POST`.

## Security properties

* Authentication is the Plinth key itself; the MCP layer adds no new credential and keeps no state.
* A key can only reach its own merchant and environment; other merchants' data is not reachable (tested in the API suite).
* No tool can change payout destinations, custody, keys or team (tested: the tool list is asserted).
* The webhook signing secret is returned once by `create_webhook_endpoint`; the assistant is told to store it server-side and never print it.
* Transport security is the API's: HTTPS in production, HSTS, no caching.

## Run it yourself

**Self-hosted API:** the endpoint is built into `apps/api` (`/mcp`); there is nothing extra to run.

**Local stdio (optional, for offline development against a local API):**

```bash
PLINTH_API_URL=http://localhost:4000 PLINTH_API_KEY=sk_test_... pnpm --dir packages/mcp start
```

This is the same tool set over stdio; it needs the API URL because it talks to an API you run. Most people should use the hosted URL above.

## Limits

* Not published as an npm package (not needed for the hosted server).
* No tool for custody withdrawals, payout changes, keys or team: by design.
* Streaming server-to-client notifications are not used (stateless).

## Development

```bash
pnpm --filter @plinth/mcp test        # 8 tests: tool list, playbook, request shape, routing of every tool family, resources and prompt, key checks
pnpm --filter @plinth/api test        # includes a real MCP client talking to /mcp over HTTP
```

The tool definitions are in `packages/mcp/src/index.ts`, the HTTP handler in `packages/mcp/src/http.ts`, the route in `apps/api/src/server.ts`. The playbook text comes from
`packages/shared/src/ai-playbook.ts`, which also feeds `/llms.txt`, `/llms-full.txt` and the website prompts, so they cannot drift apart.
