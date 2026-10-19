# Verification report

What was actually run, what it proved, what was **not** done. Dates are 2026-10-09 unless stated; the table below was re-run on 2026-10-15 after the fee, payout-wallet and multi-token changes. Nothing here is an audit.

## Test results (this machine: Windows 11, Node 24, Foundry 1.8.1, pnpm 12)

| Suite | Result | What it exercises |
| --- | --- | --- |
| `contracts` (`forge test`) | **86 passed** (unit, fuzz, invariants, fee split and fail-open fee, vault and direct kinds, router v2 nonce binding, two-token deployments; the fork tests return early unless `FORK_URL` is set) | everything in the previous row plus: fee = floor(balance × bps / 10 000), fee above the immutable cap reverts, a failing treasury is skipped (`FeeSkipped`) while a failing destination reverts, DIRECT and VAULT addresses differ, token/treasury/version are bound into the address, one factory per token |
| fork tests, **real USDC bytecode** | passed on Arc Testnet and Base Sepolia (read-only forks) | token has the expected EIP-3009 typehash/version/decimals; factory deploys, predicts, sweeps against the real token |
| `packages/shared` | 23 passed | money exactness (any token), fee arithmetic and bounds, full status derivation table, transition guard |
| `packages/db` | 6 passed (PGlite) | migrations apply; unique/partial-unique constraints (duplicate transfer log, one open sweep per address, idempotent ledger); queue claim/dedupe/retry/lock-expiry |
| `packages/blockchain` | 23 passed (real anvil + real contracts) | offline CREATE2 == on-chain `predict` for both kinds and both tokens; USDC to an undeployed address swept by a relayer, invoice address never holds gas; wrong-token detection; gasless EIP-3009 payment with **zero** native balance (USDC and EURC); tamper/replay rejected; relayer cannot withdraw; deployment facts read back from chain; gas measurements |
| `packages/engine` | 106 passed (real anvil + PGlite) | the earlier lifecycle, resilience and refund coverage, plus: fee accounting and ledger, fee skipped / mismatch checks, DIRECT mode and its refunds, payout-wallet flow (verified email, EIP-4361 proof, re-authentication, single-use link, cooldown, switch back), a database-edited payout row is refused, Web3Auth identity handling, relayer policy tiers and live fee quotes, EURC end to end |
| `apps/api` | 26 passed | auth, permissions, idempotency, isolation, rate limiting, email verification and payout methods over HTTP, operator fee override, token selection (EURC vaults, payments, links, invoices, overview), OpenAPI ↔ routes parity |
| TypeScript | clean in all 8 packages | |
| `pnpm verify:networks` | PASS on Arc Testnet and Arc (USDC **and** EURC), Base Sepolia, Base, Arbitrum One, OP Mainnet, Ethereum. **Polygon PoS not probed** (no RPC configured; registered as unverified) | read-only; EIP-712 domain reproduces each token's real `DOMAIN_SEPARATOR`; every USDC address also matches Circle's published list |
| `pnpm e2e:local` | passed | scripted acceptance run: vault → address payment → gasless sweep → wallet payment → direct payout wallet (verified email, signed proof, emailed link) → EURC payment → signed webhooks, with the merchant and treasury balances checked on-chain after each payment (`docs/verification/local-dry-run.json`) |
| Browser run (embedded browser against the local stack) | passed | hosted checkout renders; wallet discovered via EIP-6963, chain switch, EIP-712 signature, relayed, status flipped to **Settled** from backend state; dashboard overview/detail show real data |
| `deploy` pipeline on a throwaway chain | passed | `Deploy.s.sol` guards (wrong chain id reverts), `finalize-deployment` byte-verification + wiring + derivation, mainnet-override refusal |

Measured gas (local EVM, optimizer 200, single call, cold):

| Call | v1 (no fee) | v2 vault | v2 direct |
| --- | --- | --- | --- |
| `deployAndSweep` | 161 209 | 158 743 | 153 538 |
| `sweep()` on a deployed clone | 42 295 | 59 355 | not measured separately |
| `router.pay` | 93 490 | 113 889 | 108 998 |

A first fee into a treasury that holds none of the token costs about 17 k more (`deployAndSweep` 175 843). `createVault` is unchanged at ≈ 1.29 M. The earlier figures in this file (175 k, 90 k) were medians from a different measurement and are not comparable.

## Verified feature list

* Counterfactual per-invoice addresses; gasless deploy+sweep in one transaction; permissionless re-sweeps; unregistered-vault rejection.
* Merchant-owned vault with no gateway role; settlement modes `BALANCE_IN_VAULT` (default), `INSTANT_FORWARD`, `THRESHOLD_OR_PERIODIC` (contract-level, tested); owner-signed policy changes through the dashboard (built, calldata endpoint tested; the in-browser wallet *signing* of policy/withdraw transactions was **not** browser-tested).
* Independent verification, finality, reorg handling, partial/repeat/over/late/wrong-token/wrong-network accounting; ledger with distinct stages.
* Gasless wallet checkout (EIP-3009 via router) with a fallback to the address flow; capability reported per network.
* Relayer with simulation, nonce management, persisted raw tx, replacement, spend policies, kill switch, gas accounting.
* Signed, retried, idempotent webhooks with delivery log and manual retry; API keys (hashed, rotated); idempotency; rate limits; team roles; audit log.
* Dashboard pages: Overview, Payments (+detail/timeline), Transactions, Payment links, Invoices, Settlements, Refund requests, API keys, Webhooks, Webhook logs, Networks & assets, Wallets & payouts, Team, Audit log, Settings. Public site: product, networks, developers, security, pricing, status, contact.

## NOT done / not verified (be explicit)

1. **No live testnet run yet.** The throwaway testnet wallets are unfunded (Circle's faucet needs a human). Everything that would run there was dry-run on a local chain
   and the live USDC bytecode was exercised through read-only forks. The live acceptance (`pnpm e2e:testnet arc-testnet`) is one command once funded.
2. **Arc mainnet is deployed and switched on** (`deployments/arc-mainnet.json`, approved with `audit: none: owner accepted risk`); every other mainnet configuration is probed read-only and disabled. Treat this item as superseded by the README's "Live on Arc mainnet" section.
3. **No independent audit.** Do not hold meaningful value until one is complete.
4. **Real Postgres (`pg` driver) path and Docker Compose DB were not run** (Docker unavailable). Schema/migrations were generated for Postgres and exercised on PGlite
   (real Postgres engine compiled to WASM, single connection). Queue claim uses `FOR UPDATE SKIP LOCKED` which should be re-tested under true multi-connection concurrency.
5. **Phase 6 Circle integrations (CCTP, Gateway Nanopayments, Gas Station) are not implemented**; see [circle-integrations.md](circle-integrations.md) for verified facts and why.
6. **Solana** not started (separate adapter by design).
7. **Second EVM testnet (Base Sepolia)** is configured and probed, and multi-network behaviour is tested with two local chains, but contracts are **not deployed** there.
8. **No KMS/HSM `SignerProvider` implementation** (interface + env provider only).
9. **No automatic balance-vs-ledger reconciliation job** and **no per-payment amount ceilings / merchant risk limits** yet.
10. **Arc native-currency transfers** to a deposit address (value transfers, not ERC-20 `transfer`) are not log-detected; whether Arc emits a `Transfer` log for them was not tested.
11. **WalletConnect / mobile wallets** not wired (browser-injected EIP-6963 wallets only). **EIP-1271 smart-contract-wallet** payers unsupported on the gasless path.
12. **Email delivery through Resend has not been run against the real service** (the sender is exercised through an in-memory double and the console sender; no key or verified domain was available). Rate limiting and some counters are per-process; no multi-signer relayer sharding.
13. Explorer source verification is manual; no CI pipeline is included.
14. `apps/web` is typechecked/built and spot-checked in a browser (home, checkout both methods, login, overview, payment detail); not every dashboard page was visually reviewed,
    and no automated browser/e2e UI tests or accessibility audit (axe) were run. Contrast of the palette was computed, not user-tested.
15. **Fee, Direct mode and the second token (added 2026-10-15)**: it is deployed on Arc mainnet and bytecode-verified (24 checks pass); the fork tests were not re-run against the live USDC with the v2 contracts (no `FORK_URL` available here). The EURC flows ran only against a faithful test double on a local chain; the live EURC contracts on Arc were probed read-only (symbol, decimals, EIP-712 domain, `receiveWithAuthorization`, `transferWithAuthorization`, `permit`) and passed on both Arc networks.
16. **Web3Auth re-authentication and Google email-verified claims were not tested against a live Web3Auth project.** Token handling is tested with signed test tokens against all three JWKS shapes; whether a Google login carries `email_verified` depends on the dashboard setting "User details in ID token".
17. **Polygon PoS** was not probed (no RPC configured), so its registry entry stays unverified and disabled. Other USDC chains on Circle's list (Avalanche, Linea, Unichain, World Chain, Sonic, Sei, Monad, and others) are **not** in the registry: each needs its chain id, RPC, finality rule and log-range limit verified before it can be added.
18. **Direct-mode trade-off and backend compromise** are described in [threat-model.md](threat-model.md); the stored-signature check stops database-only tampering, not a compromised API process.

## Known issues / sharp edges

* `payment.confirmed` can fire when status jumps straight to `SETTLEMENT_PENDING` (e.g. a top-up after a partial sweep) — intended, but consumers must key off the event, not on seeing `PAID`.
* With the relayer enabled, `PAID` is usually skipped in the stored status because the sweep is planned in the same transaction (the transition is still emitted as `payment.confirmed`).
* Vault addresses are identical across chains for the same owner + factory address (CREATE2); invoice addresses are not (chain id is bound in). This is intentional.
* The dev stack and tests use a faithful FiatTokenV2 *test double* for USDC; the real token is only exercised through read-only forks and probes.
