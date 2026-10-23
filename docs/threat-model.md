# Threat model

Assets, in order: (1) merchant funds (USDC, and EURC on Arc) in vaults, in payout wallets and in transit at invoice addresses, (2) correctness of payment status (never "paid" when not),
(3) the relayer's operational funds, (4) credentials/signatures, (5) availability.

Actors: customer, merchant, merchant staff, **gateway operator (assumed fully compromised; see "What a total backend compromise can and cannot do" for what that does and does not protect)**, relayer key holder,
third-party callers, RPC providers, token issuer.

## Custody (the headline property)

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| Gateway/relayer redirects funds at an **already issued** address | No admin/operator/upgrade role exists; `sweep()` has no parameters; the destination (vault or payout wallet), fee rate, kind and token are in the clone's immutable args and its CREATE2 address | `InvoiceSweep.t.sol` (hijack, arbitrary-recipient, direct-call tests), `Invariants.t.sol` (no leakage, relayer/attacker never hold funds) |
| Gateway changes vault policy / withdraws | Only `owner`; engine test calls `withdraw`, `scheduleSettlement`, `transferOwnership` as the relayer and expects reverts | `lifecycle.test.ts` "relayer address has no authority", `gasless-sweep.test.ts` |
| Compromised merchant (vault owner) key | **Not mitigated by the contracts.** `withdraw` is owner-only and immediate, so a stolen owner key drains the vault whatever the delay. The `CONFIG_DELAY` on forwarding rules is an operational control (a forwarding destination cannot be swapped silently by tooling or a half-trusted signer); it is not a defence against owner-key theft. Use a multisig or hardware-wallet owner | `MerchantVault.t.sol` |
| Squatting a merchant's vault address | Address commits to `(merchantId, owner, delay)` | `test_vaultAddressCommitsToOwnerSoItCannotBeSquatted` |
| Front-running invoice deployment | No initializer; immutable args; attacker's different vault ⇒ different address | `test_attackerCannotRedirectBySupplyingDifferentVault` |
| Cross-chain replay of invoice clones | `chainId` in args + salt; `sweep()` checks `block.chainid` | `test_chainIdIsBoundIntoCloneArgs`, `multichain.test.ts` |
| Signature re-pointing (invoice/amount/vault) | Nonce is a hash of every field and is inside the signed message | `PaymentRouter.t.sol` tamper tests |
| Signature replay / expiry | Token's single-use nonce; validity window; relayer rejects expired authorizations; calldata wiped post-confirmation | router + lifecycle tests |
| Wrong/forged token counted as the payment token | Only the official address of the token the payment was created in counts; others (including the other official token) are recorded as `INVALID_ASSET` and ignored; never auto-swept | `lifecycle.test.ts` invalid-asset |
| Other tokens stuck in a clone | `rescueToken` for the vault owner (vault mode) or the payout wallet itself (direct mode); it cannot touch the clone's own token | `InvoiceSweep.t.sol`, `InvoiceFee.t.sol` |
| Fee changed or inflated after an address is issued | Fee rate is in the clone's args and so in the address; the implementation's `MAX_FEE_BPS` (1%) is immutable and a clone with a larger rate reverts on sweep; the router checks the same cap | `InvoiceFee.t.sol`, `PaymentRouter.t.sol` |
| A failing treasury blocks settlement | Fee leg is fail-open: if the treasury transfer fails the full amount goes to the destination and `FeeSkipped` is emitted; a destination failure still reverts | `InvoiceFee.t.sol` |
| Treasury address is a contract that misbehaves | Treasury is an immutable of the implementation, assumed to be a plain account; `finalize-deployment` checks it has no code on each chain and warns otherwise | `scripts/finalize-deployment.ts` |

## What a total backend compromise can and cannot do

The earlier claim, that a total compromise of the backend cannot take merchant funds, is true only for funds that are **already at an
issued address or in a vault**. The honest statement is:

**It cannot**

* withdraw from a vault, change its owner or its settlement rules;
* redirect funds sent to a payment address that has already been issued (the destination is part of the address);
* reuse a customer's signed payment for a different amount, payer or recipient.

**It can**

* hand out **new** checkout addresses whose committed destination is the attacker's wallet. A customer cannot verify an address by
  looking at it, so they would pay the attacker. This is inherent to a hosted checkout that derives addresses server-side.
* stop service, delay settlements, or spend the (capped) relayer gas budget.

**Partial mitigation (not a guarantee).** Before the engine derives an address it verifies the merchant's stored payout signature (the
EIP-4361 message the payout wallet signed, bound to merchant, network and wallet) and a committed route per payment. This stops tampering
with the database alone, for example a SQL injection or a stolen database credential that rewrites a payout row. It does **not** stop an
attacker who controls the API process, which can sign with the same code path. Further reductions (customer-side address verification, a
separate signing service for route commitments, merchant-pinned addresses) are not built.

## Payout wallets (Direct mode) and the vault

| Threat | Mitigation |
| --- | --- |
| Payout wallet changed by a stolen session | Every change needs a fresh re-authentication (password, or a Web3Auth login within 5 minutes), a signature from the new wallet (EIP-4361, single-use nonce, chain-bound), and, **when `REQUIRE_EMAIL_CONFIRMATION` is on (it is off by default for now)**, a verified email and a single-use confirmation link emailed to the account; a notice goes out on every change to owners who have an email; a cooldown (`PAYOUT_COOLDOWN_SECONDS`, 24 h in production) applies before it takes effect |
| Payout to a contract, the treasury or a protocol address | Only plain accounts are accepted (no code); the treasury and every deployed Plinth contract and token address are refused; the token's `isBlacklisted` is probed |
| Direct mode: the payout wallet is the funds | **Accepted trade-off.** A stolen payout-wallet key moves everything it holds at once. (A vault owner key can also withdraw at once; the vault only adds the delay on forwarding rules and the option of a multisig owner.) The cooldown on *changing* the wallet, the signed proof, re-authentication and, when enabled, email confirmation are the brakes on changing where new payments go. Switching back to the vault is immediate but needs re-authentication |
| Wallet-only accounts (no real email) | Must add and verify an email first; Google sign-in counts as verified, a placeholder address never does |
| Refunds in Direct mode need custody | They do not: a refund is a transfer the merchant signs from the account that received the funds (vault or payout wallet); the proof checks `Transfer(from=that account, to=recipient, value)` of the payment's token, capped at the net amount |

## Custodial mode (a trust change)

In every other mode the gateway holds no key that can move merchant funds. **In custodial mode it does**: the custody wallet's key can move everything merchants hold there, and merchants trust the
platform to keep the ledger honest and to pay out. Custody is off by default and must stay off on a mainnet until the owner has approved it, an independent audit covers it and the key is in a KMS.

| Threat | Mitigation | Remaining risk |
| --- | --- | --- |
| Custody key theft | Separate key from the relayer and the treasury; env key refused in production without an explicit override; per-network key; a withdrawal can only be signed for a merchant's proven wallet | The key is a hot key on the server. A theft empties the wallet. Use a KMS/HSM and keep the wallet's balance small (scheduled payouts) |
| Withdrawal redirected | Destination is never in the request; it is the newest confirmed custodial wallet, re-verified against its stored EIP-4361 signature at request time | A compromised API process can still create a new withdrawal wallet record and sign proofs |
| A stolen session drains the balance | Withdrawal and schedule changes need a fresh re-authentication; a new withdrawal wallet needs a signature and the cooldown (and, when enabled, a verified email and the emailed link); every request emails the owner if the account has an email | Within the cooldown window an attacker with email access can still win |
| Double spend of a balance | Ledger debit in the same DB transaction, serialised per merchant; idempotency key per request; one transfer in flight per network; a failure credits back once | Database corruption or manual edits |
| Insolvency (wallet holds less than owed) | Solvency check every tick, per token; withdrawals pause and a critical alert fires | The check cannot prevent a theft, only stop paying out against a hole |
| Issuer blocks the custody wallet or the recipient | A transfer that would revert is failed and credited back; a blocked custody wallet stops all payouts for that token | Funds in a blocked wallet are frozen by the issuer |
| Refunds | Refunds of custodial payments are refused for now | Merchants must be refunded by support |

Because payments are sent to a platform address, a **compromised backend can also redirect new custodial payments to itself**, exactly as it can hand out new addresses in the other modes (see above).


| Threat | Mitigation |
| --- | --- |
| Double-credit from duplicate scans / racing workers | Unique `(network, txHash, logIndex)`; idempotency-keyed ledger; one open sweep per address; tests with concurrent watchers and deep rescans |
| Reorg after crediting | Block hash re-checked every tick until final; `REORGED` reverses ledger and rewinds cursor |
| Lagging RPC node mistaken for a reorg | "Node behind" check (`head < block`) skips instead of reversing |
| Fake success from the browser | Checkout renders status from the backend only; webhooks come from the backend; redirect is a link shown after verified status |
| Underpay / overpay / late | Pure derivation with tolerance policy; late funds never count as on-time |
| Dust griefing (gas burn) | `minSweepUnits` per network; below it, sweep only when the invoice is satisfied |
| Stale head → premature finality | `cacheTime: 0` on chain clients |

## Relayer & backend

| Threat | Mitigation |
| --- | --- |
| Runaway spend / fee spike | per-tx fee cap, daily budget, op cap, min balance, deferral + alerts, kill switch (`/admin/relayer/:net/pause`, `RELAYER_KILL_SWITCH`) |
| Stuck / lost transactions | persist raw tx before broadcast; rebroadcast; same-nonce fee bump; nonce re-queue; tested with automine off + dropped tx |
| Key theft | Separate key per role; `SignerProvider` for KMS/HSM; env key refused in production without explicit override; relayer holds **only gas** |
| API abuse | Rate limits (per credential / IP), strict zod validation, 100 KB body cap, structured errors without internals, idempotency keys (replay + conflict detection) |
| Credential stuffing | scrypt hashing, uniform login errors/timing, 10 req/min limit on auth routes |
| SSRF via webhooks | https only, DNS-resolved private-range rejection at create **and** delivery, no redirects |
| Secret leakage | API keys/sessions stored as SHA-256; webhook secrets AES-GCM; audit/alert detail redacts keys named secret/token/signature/etc. |
| CSRF on dashboard | httpOnly SameSite=Lax cookie; BFF requires same-origin `Origin` + custom header |
| Cross-tenant access | Every query scoped by merchant id; tests for payments, refunds, vaults |

## Residual risks (not mitigated by this repository)

* **Unaudited contracts.** Fee splitting and the Direct mode are new code and have had no independent review. An independent audit has not been done; the owner accepted this risk.
* **Issuer controls.** USDC and EURC can be paused/blocklisted by their issuer; a blocked vault, payout wallet, treasury or invoice address cannot receive or sweep (a blocked treasury only skips the fee).
* **Plinth treasury key.** The treasury receives the fee on every payment. Its key is outside this repository; it is assumed to be a plain account, and rotating it needs a new implementation version that affects only new addresses.
* **Wrong network deposits** sent to an address that does not exist on that chain are unrecoverable (no one holds a key); the UI warns prominently.
* **RPC integrity.** Verification trusts RPC responses; production should use ≥ 2 independent providers (supported via fallback transport) and consider a quorum check.
* **Arc native-balance transfers** (value transfers rather than ERC-20 `transfer`) are not detected from logs; they appear only via reconciliation. Not verified live.
* **Smart-contract wallet payers** (EIP-1271) are unsupported on the gasless path; they can use the address flow.
* **Rate-limit store** is per process; run behind a gateway or add a shared store before scaling API replicas.
* **Single relayer signer per network**, so throughput is bounded by one nonce sequence; horizontal scaling needs multiple signers/shards.
