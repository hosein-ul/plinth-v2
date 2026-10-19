# Deploy handoff (for the next agent)

Goal: **mainnet**, starting with **Arc mainnet**. This file is everything needed to take the repository from "tested locally, web and API live" to "contracts deployed and the network open".
Read it top to bottom; every command is copy-paste. Repository: `github.com/hosein-ul/plinth`, branch `master`.

> The owner says this is a **sample project built for Arc**. They have accepted the "unaudited" status. Arc mainnet is deployed and live; the site and docs describe it that way (pre-audit, small amounts).

---

## 0. Current state (as of this commit)

| Piece | State |
| --- | --- |
| Code | Everything is committed and pushed. Tests: shared 23, mcp 8, db 6, blockchain 23, engine 120, api 28, Foundry 87, all passing |
| Web (Vercel project `plinth`, Root Directory `apps/web`) | **Live** at https://plinth.zerolayer.online with the new landing (deployed from branch `super-landing`, now merged into `master`). Deploy from `master` is safe |
| API (Render service `plinth-api`, `srv-db7nb1q5b2lc738io42g`, https://plinth-api.zerolayer.online) | **Live**, and `POST /mcp` answers (401 without a key), so the release that added the hosted MCP server is deployed |
| Database | Neon Postgres. **Unverified: whether migrations 0002 to 0006 were applied.** Check (section 2) |
| Keepalive | Cloudflare worker `infra/keepalive` pings `/readyz` every 5 minutes |
| `plinth-pay` (Vercel, the Telegram fork `apps/telegram`) | **Stale and redundant**: the landing now serves both audiences. Do not deploy it; the owner decides whether to delete it |
| Contracts | Deployed and byte-verified on Arc mainnet (USDC and EURC sets); see `deployments/arc-mainnet.json` |
| Custody (platform-held balances) | Code exists, **off by default** (`CUSTODY_ENABLED`). Leave it off |
| Email confirmation for payout wallets | **Off by default** (`REQUIRE_EMAIL_CONFIRMATION`). Resend is not configured |

## 1. Security rules for whoever deploys

1. **The deployer private key the owner pasted in chat is compromised.** Do not write it into any file, command history that is committed, `.env*`, or this repository. Ask the owner to give you a key through a local keystore
   (`cast wallet import deployer --interactive`) or an `export` in their own terminal. Use a key that holds **only** the gas needed for the deploy, and after deploying, move anything left out of it.
2. The deployer key never goes on Vercel or Render. Only the **relayer** key goes on Render (the API/worker process), as a separate, small-balance key.
3. The Claude Code auto-mode classifier blocked the previous agent from every deploy-related command, even read-only ones (`cast balance`). If you are the same tool, the owner must switch the permission mode to one that asks per command, or run the
   commands themselves.
4. Never fabricate an audit reference. `approve:deployment` needs `--audit "<text>"`; use an honest value such as `"none: owner accepted risk; internal review in docs/security-review.md"`.
5. Do not enable custody on mainnet.

## 2. Preflight (read-only, run first)

```bash
git pull origin master
pnpm install
(cd contracts && forge build) && pnpm abis
pnpm typecheck && pnpm test                 # expect all green
pnpm test:contracts                         # expect 87 passed
pnpm verify:networks arc-mainnet            # expect every line PASS for USDC and EURC, plus "log range"
```

Check the production API and database:

```bash
curl -s https://plinth-api.zerolayer.online/readyz
curl -s https://plinth-api.zerolayer.online/public/status
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://plinth-api.zerolayer.online/mcp   # 401 means the hosted MCP route exists
```

Migrations: the Render service must have `RUN_MIGRATIONS=true` for the release that contains migrations 0002 to 0006 (expiry default, fee and payout tables, verified email, token columns, custody). Open the Render logs of the latest deploy and confirm
the migration ran; if unsure, set `RUN_MIGRATIONS=true` and redeploy once (it is idempotent), then set it back to `false` if preferred. Tables that must exist afterwards: `merchant_payout_configs`, `payment_intent_routes`, `custody_withdrawals`.

## 3. Deploy the contracts to Arc mainnet

Arc mainnet facts (verified read-only on 2026-10-15 with `pnpm verify:networks`):

| | |
| --- | --- |
| Chain id | `5042` |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io` |
| USDC | `0x3600000000000000000000000000000000000000` (native, 6-decimal ERC-20 interface, version 2) |
| EURC | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` (6 decimals, version 2) |
| Gas | paid in USDC; minimum `maxFeePerGas` 20 gwei (the relayer enforces it) |
| Treasury (platform fee recipient) | `0xc0d1ac70a3a32bcea4a124e65eb22eb5f0d0adc2` (owner confirmed it is a plain EOA; `finalize` re-checks that it has no code) |
| Fee | default 20 bps (0.20%), immutable cap 100 bps (1%) |

The deployer account needs a little **USDC on Arc mainnet** (it is the gas token). One deploy of a token's contract set costs a small amount; keep a few USDC.

Run from the repository root. Use a keystore (preferred) or an exported key in **your own terminal only**.

```bash
# USDC contract set
cd contracts
ALLOW_MAINNET_DEPLOY=true EXPECTED_CHAIN_ID=5042 \
TOKEN_ADDRESS=0x3600000000000000000000000000000000000000 \
TREASURY=0xc0d1ac70a3a32bcea4a124e65eb22eb5f0d0adc2 \
  forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.arc.io --account deployer --sender <DEPLOYER_ADDRESS> --broadcast
cd .. && pnpm finalize:deployment --network arc-mainnet
```

```bash
# EURC contract set (a separate set: the token is an immutable of every contract)
cd contracts
ALLOW_MAINNET_DEPLOY=true EXPECTED_CHAIN_ID=5042 TOKEN_SYMBOL=EURC \
TOKEN_ADDRESS=0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1 \
TREASURY=0xc0d1ac70a3a32bcea4a124e65eb22eb5f0d0adc2 \
  forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.arc.io --account deployer --sender <DEPLOYER_ADDRESS> --broadcast
cd .. && pnpm finalize:deployment --network arc-mainnet --token EURC
```

Defaults you should not change: `MAX_FEE_BPS=100`, `CONTRACT_VERSION=2` (part of every invoice address; changing it later changes addresses), `VAULT_CONFIG_DELAY_SECONDS=86400` (baked into each vault at creation).
A raw private key on the command line (`--private-key`) also works, but it ends up in shell history; prefer `--account`.

What the scripts do: `Deploy.s.sol` refuses a wrong chain id, a token without code or not 6 decimals, a zero treasury, and any production chain without `ALLOW_MAINNET_DEPLOY=true`, then writes `deployments/raw-5042.json` (and `raw-5042-EURC.json`).
`finalize:deployment` **byte-compares** all contracts with the build artifacts, checks wiring to the official token, the treasury, the 1% cap and that the offline CREATE2 derivation equals `InvoiceFactory.predict()`, then writes
`deployments/arc-mainnet.json` with `bytecodeVerified: true` and `productionApproved: false`. Any FAIL: stop, do not continue.

Commit the two records (`deployments/arc-mainnet.json` and the raw files are public addresses, no secrets) and push.

## 4. Approve (a human step, once)

A mainnet stays closed until the record is approved:

```bash
I_HAVE_COMPLETED_THE_MAINNET_CHECKLIST=yes pnpm approve:deployment --network arc-mainnet \
  --reviewer "<owner name>" --audit "none: owner accepted risk; internal review in docs/security-review.md"
```

This sets `productionApproved: true` and records the reviewer. Commit and push the updated record. (Adding a token to an approved network withdraws the approval until this is run again, so deploy **both** token sets first, then approve once.)

## 5. Configure the API/worker (Render), not Vercel

On the Render service that runs the API (and worker, if separate), set:

| Variable | Value |
| --- | --- |
| `ENABLED_NETWORKS` | `arc-mainnet` (add `arc-testnet` only if it has a verified record) |
| `ALLOW_MAINNET` | `true` |
| `RPC_URLS_ARC_MAINNET` | at least two providers, comma separated, first is primary; `https://rpc.mainnet.arc.io` is the public default |
| `RELAYER_PRIVATE_KEY_ARC_MAINNET` | a **new** key, only for gas (a few USDC). Never the deployer key |
| `ALLOW_ENV_SIGNER_IN_PRODUCTION` | `true` (explicit acceptance of an env key; no KMS exists yet) |
| `RELAYER_POLICY_ARC_MAINNET` | recommended; the `arc` tier has defaults, see `.env.example` for the JSON shape |
| `CUSTODY_ENABLED` | leave unset (off) |
| `REQUIRE_EMAIL_CONFIRMATION` | leave unset (off) unless Resend is configured (`RESEND_API_KEY`, `EMAIL_FROM`) |
| `RUN_MIGRATIONS` | `true` for one deploy if migrations were not applied (section 2) |

Already set and unchanged: `DATABASE_URL`, `APP_SECRET_KEY`, `PUBLIC_WEB_URL`, `ADMIN_API_TOKEN`, CORS and the rest. After saving, redeploy the service and confirm in the logs that `arc-mainnet` is operational:
`curl -s https://plinth-api.zerolayer.online/public/status` must list `arc-mainnet` as operational with both tokens. If it says why not (`gateReasons`), fix that reason; common ones: missing record, not approved, missing signer, no RPC.

The relayer address (print it from the key with `cast wallet address`) must hold a few USDC on Arc mainnet. Alerts fire at the low-balance threshold.

## 6. Web app (Vercel `plinth`)

No contract addresses are needed in Vercel: the web app talks to the API. The existing environment already works (`API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, Web3Auth and WalletConnect ids). Optional: `NEXT_PUBLIC_MCP_URL` if the MCP URL ever differs from
`https://plinth-api.zerolayer.online/mcp`. To redeploy after changes: `vercel deploy --prod --yes` from the repository root (linked to project `plinth`).

## 7. Canary on mainnet (small, real, before telling anyone)

1. Sign in to the dashboard (`https://plinth.zerolayer.online/login`) in **live** mode (the Testnet/Mainnet switch, bottom left), create the vault for Arc (USDC), and confirm the vault owner address is the owner's own wallet.
2. Create a payment of `0.50` USDC, pay it from a normal wallet through the checkout (wallet flow) and again through the address flow.
3. Confirm: status `SETTLED`, the vault balance is `0.50` minus the fee (`0.0010`), the treasury received the fee, the invoice address never held gas, webhooks arrived signed.
4. Repeat once in EURC. Then run the owner withdraw from the vault.
5. Watch the relayer balance and the alerts for a day.

## 8. If something is wrong

* **Stop new work:** `POST /admin/relayer/arc-mainnet/pause` (header `x-admin-token: <ADMIN_API_TOKEN>`) or `RELAYER_KILL_SWITCH=true`. Funds are never trapped: merchants own their vaults and anyone can call `sweep()`.
* **Close a network:** remove it from `ENABLED_NETWORKS` and redeploy. Existing vaults stay the merchants'.
* **Wrong treasury or fee cap:** these are contract immutables. Deploy a new version (`CONTRACT_VERSION=3`), finalize, approve; only **new** invoices use it.

## 9. After it works: update the public wording

The site, FAQ, Terms, Security and Risk pages and the README say "testnets only today, no mainnet is open". Once Arc mainnet is genuinely operational, change those to say Arc mainnet is live (and that the contracts have had an internal review only, if still true). Files: `apps/web/src/app/(site)/{security,pricing,networks,legal/*}`,
`apps/web/src/components/marketing/pages/faq-data.ts`, `apps/web/src/lib/ai-kit.ts`, `README.md`, `docs/README.md`, `docs/verification.md`. Update `docs/networks.md` and `docs/verification.md` with the real deployment addresses and the canary results.

## 10. Other chains, later

The registry lists 26 networks (`docs/networks.md`). Deploying another chain repeats sections 3 to 5 with that chain's id, RPC and token address (take addresses from `packages/shared/src/networks.ts`, and re-run `pnpm verify:networks <id>`).
Notes: networks whose native token is not ETH (Avalanche, Celo, Sei, Sonic, ...) stay **closed until `RELAYER_POLICY_<NETWORK>` is set**; finality for the 18 recently added chains was chosen by us and should be confirmed against each chain's documentation; XDC's public RPC is unreliable (use a dedicated one);
Polygon PoS was never probed (no RPC in the earlier environment); EDGE and Pharos are pending; ZKsync Era is not supported (different CREATE2).

## 11. Where to look

* `docs/operations.md`: every environment variable, alerts, emergency stop, treasury rotation, adding a token.
* `docs/mainnet-launch-checklist.md`: the original gate (it assumes an audit and a KMS; the owner has chosen to proceed without them for this sample).
* `docs/networks.md`, `docs/architecture.md`, `docs/threat-model.md`, `docs/security-review.md`, `docs/mcp.md`, `docs/api-guide.md`.
