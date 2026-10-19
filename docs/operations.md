# Operations runbook

## Processes

| Process | Replicas | Notes |
| --- | --- | --- |
| `apps/api` | N (stateless) | rate-limit store is in-memory per process |
| `apps/worker` | **1 active per network** recommended | watcher/relayer are idempotent and safe to race, but one relayer signer ⇒ one nonce sequence; a per-network in-process lock serialises it. Run a standby, not two actives, until multi-signer sharding exists |
| `apps/web` | N | needs `API_URL` (server-side only) |
| Postgres | managed | PITR + restore drills; the ledger is the system of record |

## Account-takeover controls (2026-10-19 audit follow-up)

| Control | Where | Notes |
| --- | --- | --- |
| Team changes need the acting person's password (or fresh Web3Auth sign-in) | `POST /v1/team`, `PATCH /v1/team/:id`, `POST /v1/team/:id/remove` | A stolen session alone can no longer add an owner. Every owner/admin with a verified email is told. |
| New team members wait the payout cooldown before money-related actions | `PAYOUT_COOLDOWN_SECONDS` (24 h in production) | Applies to payout wallets, custody withdrawals/schedules and further team changes. The account's first user is exempt. |
| Failed sign-ins and bad credentials are throttled per client address (and per address + email for passwords) | in-memory, per API process | Put a shared limiter or gateway in front when running more than one API replica. |
| Rate limits key anonymous routes by IP only | `apps/api/src/server.ts` | Set `TRUST_PROXY=true` when the API is behind exactly one trusted proxy; the API warns in production when it is unset. |
| Dashboard sessions: suspended merchants are cut off, "sign out everywhere else", password change, hourly pruning | `/v1/auth/sessions/revoke-others`, `/v1/auth/password` | There is still no emailed password-reset flow. |
| Relayer daily budget split | `relayer.ts` `KIND_SHARE` | Vault creation 15 %, forwards 20 %, policy activations 5 % of `maxOpsPerDay`; sweeps and wallet payments keep the rest. |

## Secrets & keys

* Production relayer key: implement `SignerProvider` against your KMS/HSM (returns a viem `LocalAccount` whose `signTransaction` calls the KMS).
  Env keys are refused in production unless `ALLOW_ENV_SIGNER_IN_PRODUCTION=true`.
* Keep three roles separate: **deployer** (one-off), **relayer** (gas only), **merchant owners** (never ours).
* Rotate `APP_SECRET_KEY` by re-encrypting `webhook_endpoints.secret_enc` (decrypt with old, encrypt with new) in a maintenance window.

## Configuration added with fees, payout wallets and tokens

| Variable | Default | Meaning |
| --- | --- | --- |
| `PLATFORM_FEE_BPS` | 20 | Default fee for new invoice addresses (never above the contract's immutable cap of 100). A merchant's own rate is set with `POST /admin/merchants/:id/fee` (operator token). |
| `RESEND_API_KEY`, `EMAIL_FROM` | none | Resend credentials and the verified sender (for example `Plinth <no-reply@your-domain>`). Without a key the API prints emails to the console in development; in production the flows that need email (verification, payout wallet confirmation) answer `503 EMAIL_UNAVAILABLE` instead of pretending to work. |
| `REQUIRE_EMAIL_CONFIRMATION` | false | When true, a new payout or withdrawal wallet needs a verified email and a link emailed to the account. When false (the default for now), the signed proof, a fresh re-authentication and the cooldown are the protections and no email address is needed. Turn it on once Resend is configured. |
| `PAYOUT_COOLDOWN_SECONDS` | 0 (dev), 86400 (production) | Wait between confirming a payout wallet and it taking effect. |
| `REQUIRE_VAULT_OWNER_PROOF` | on in production | A vault owner must sign a challenge, so a mistyped owner address can never own a vault. |
| `RELAYER_POLICY_<NETWORK>` | tier default | JSON override of `perTxFeeCap`, `dailyBudget`, `opCap`, `minBalance` for one network. Defaults are low on L2s and higher on Ethereum mainnet. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | none | Shown to merchants on the verification and payout pages. |
| Web3Auth dashboard | n/a | Enable **User details in ID token**; otherwise Google sign-in carries no email claim and the account cannot count as email-verified. |

Migrations 0002 to 0005 add the expiry default, fee and payout tables, verified email and the token columns. Set `RUN_MIGRATIONS=true` on the API service (Render) for the
release that includes them, then check the service logs.

### Custody (custodial payouts)

Off by default. A mainnet must not use it until the owner has approved it in writing.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CUSTODY_ENABLED` | false | Turns the custodial payout mode on for networks that also have a key. |
| `ALLOW_CUSTODY_MAINNET` | false | Needed in addition on a mainnet. |
| `CUSTODY_PRIVATE_KEY`, `CUSTODY_PRIVATE_KEY_<NETWORK>` | none | The custody wallet's key. Must differ from the relayer key and the treasury. Refused from the environment in production unless `ALLOW_ENV_SIGNER_IN_PRODUCTION=true`; implement `SignerProvider.getCustodySigner` against a KMS instead. |

Fund the custody address with gas only as needed (alert `custody-gas-low:<net>`). Alerts: `custody-insolvent:<net>:<token>` (critical; withdrawals for that token are paused; compare the on-chain balance with the sum of `CUSTODY_BALANCE`),
`custody-withdrawal-failed:<id>`, `custody-stuck:<id>`, `custody-fee-cap:<net>`. Reconciliation: the custody wallet's token balance must be at least the sum of merchants' `CUSTODY_BALANCE` plus withdrawals in `SUBMITTED`.

### Treasury and fee rotation

The treasury address is an **immutable** of each `InvoiceDeposit` implementation (and of the router). Rotating it is a new contract version, not a setting:

1. Change the address in `packages/shared/src/fees.ts` (per-network map), bump `CONTRACT_VERSION`, deploy the new implementation, factory and router for each network and token.
2. `pnpm finalize:deployment` verifies the treasury on-chain (and warns if it has code), then a human re-runs `pnpm approve:deployment`.
3. New invoices use the new version. Addresses already issued keep paying the old treasury (the version and treasury are part of each address), so old invoices remain valid and nothing is rewritten.

Changing only the default **fee rate** needs no deployment: it is a configuration value written into each new address, bounded by the 1% cap.

### Adding a token on a network

Take the address from the network's official documentation, add it to `extraTokens` with its source, run `pnpm verify:networks <network>` (it must pass for the token), deploy with
`TOKEN_SYMBOL=<TOKEN>` in the Foundry script, then `pnpm finalize:deployment --network <id> --token <TOKEN>`. Adding a token to an approved network withdraws that network's approval until a human approves again.

## Where the signing keys live, and the interim setup without a KMS

The relayer key and the custody key are used by the **API and worker processes** (for example the Render services), never by the web app. Do **not** put them in Vercel: the web app does not sign anything.
Set them on the service that runs the API/worker:

| Variable | Notes |
| --- | --- |
| `RELAYER_PRIVATE_KEY` (or `RELAYER_PRIVATE_KEY_<NETWORK>`) | Pays gas for sweeps. Holds gas only. |
| `CUSTODY_PRIVATE_KEY` (or `..._<NETWORK>`) | Only if custody is on. Must differ from the relayer key and the treasury. |
| `ALLOW_ENV_SIGNER_IN_PRODUCTION=true` | Required in production to accept env keys. This is the explicit "I accept the risk" switch. |

Rules for the interim (until a KMS/HSM `SignerProvider` exists): use **testnets only**, use **fresh keys that hold only a small gas balance**, never reuse a key from a wallet you care about, generate them with `pnpm keys:testnet`,
and keep the values only in the host's secret store. A KMS is required before any mainnet because a leaked env key on a mainnet loses real money.

## Alerts and what to do

| Alert key / title | Meaning | Action |
| --- | --- | --- |
| `low-balance:<net>` | relayer gas below `lowBalanceAlertWei` | top up the relayer wallet (it holds nothing else) |
| `balance-block:<net>` | cannot submit without breaching `minBalanceWei` | top up immediately; ops stay QUEUED and are safe |
| `fee-cap:<net>` / `gas-cap:<net>` / `ops-cap:<net>` | policy limit reached | inspect the cause (fee spike, abuse); raise the limit deliberately or wait |
| `stuck-op:<opId>` | max fee replacements reached | check mempool/RPC; cancel by sending a 0-value tx on that nonce from the relayer, then the op auto-requeues |
| `op-failed:<opId>` / `settlement-failed:<pi>` | simulation or on-chain revert | read `relayer_operations.last_error`; fix cause (e.g. vault not registered); the planner retries with back-off |
| `settlement-exhausted:<addr>` | `maxSettlementAttempts` used up | fix the cause; anyone (including the merchant) can still call `InvoiceDeposit.sweep()` — funds are never trapped by our software |
| `invalid-asset:<tx>` | wrong token sent to an invoice | informational; the vault owner (or the payout wallet in direct mode) can recover it via `InvoiceDeposit.rescueToken` |
| `fee-skipped:<tx>` | the treasury transfer failed and the merchant received the full amount | informational; check whether the treasury address is blocklisted by the token issuer |
| `fee-mismatch:<tx>` | the fee observed on-chain differs from the fee committed for that address | critical; compare the event with `invoice_addresses.fee_bps` and the deployed contracts before any further settlement |
| `payout-proof-invalid:<configId>` | a confirmed payout wallet no longer matches the signature stored for it (database edited), so no payment address is issued for it | critical; treat as a database compromise: compare the row with the audit log and the merchant's confirmation email, restore it, rotate database credentials |
| `treasury-has-code:<net>` | the treasury address has contract code on that network | it is assumed to be a plain account; confirm it can receive the token |
| `loop-failing:<net>:watcher/relayer` | ≥ 5 consecutive failures (RPC outage) | check providers; state is durable, work resumes and rescans an overlap window |

A deployed contract that stops reading back the expected token, chain, version, treasury or fee cap is not an alert: the network (USDC) or the token (EURC) is closed to new payments, the reason appears under *Not available yet* on the Networks page, and `deployment verification failed` is logged. The check repeats every 5 minutes.

## Emergency stop

`POST /admin/relayer/<network>/pause {"reason":"…"}` (header `x-admin-token`) or `RELAYER_KILL_SWITCH=true` stops **new** relayer actions; in-flight
transactions still reconcile; watcher/ledger keep running so no deposit is missed. Resume with `/resume`. Because merchants own their vaults and anyone
can call `sweep()`, pausing never endangers funds; it only delays settlement.

## Common procedures

* **RPC outage:** providers fail over automatically (`RPC_URLS_*`). After recovery the watcher rescans `finality + 6` blocks of overlap; if the outage was
  long, set `watcher_cursors.last_scanned_block` to the last known-good block and let it catch up (≤ 40 chunks/tick).
* **Missed deposit suspicion:** reset the cursor for the network to the invoice's `created_block`; ingestion is idempotent.
* **Reorg:** automatic; look for `chain.reorg` in the payment timeline and `chain.reorg_detected` in the audit log.
* **Stuck invoice at `SETTLEMENT_FAILED`:** fix cause; the `replan` job retries after back-off; or call `sweep()` yourself.
* **Add a network:** `docs/architecture.md` §6. **Retire a network:** remove from `ENABLED_NETWORKS`; existing vaults remain the merchants' on-chain.
* **Reconciliation:** compare `GET /v1/vaults/<net>` balance with the sum of `SETTLED_TO_VAULT` ledger entries minus withdrawals/forwards. Swept events whose invoice, merchant, vault or token disagree with our records are rejected and written to the audit log (`sweep.mismatch`). A scheduled automatic balance-vs-ledger reconciliation job is **not built yet** (see verification report).

## Backups & retention

Back up Postgres; keep `audit_events`, `ledger_entries`, `transactions`, `payment_events` indefinitely. `webhook_attempts` may be pruned after 90 days.
`relayer_operations.calldata` for wallet payments is wiped on completion by design (it contains customer signatures).
