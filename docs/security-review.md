# Internal security review (2026-10-15)

> **This is not an independent audit.** It is what the team could run and read itself, in a short time, before a first deployment. It does not replace an audit by an outside firm and
> must not be described as one. The public site, the README and every launch document say the same.

Scope: the six Solidity contracts (`contracts/src`, 717 lines), the settlement and ledger engine, the payout and custody code, and the registry additions.

## What was run

| Check | Result |
| --- | --- |
| Foundry suite | **87 tests passed**: unit, fuzz, invariants, fee split and fail-open fee, vault and direct kinds, router nonce binding, two-token deployments |
| Heavy campaign | The same suite with **20,000 fuzz runs per test** and **1,000 invariant runs at depth 100** (about 34,000 handler calls per invariant): all passed, no counterexample |
| Slither (80 detectors) | 12 results, **no high or medium finding**. Details below (run before the two hardening changes listed under Findings; the changes only add address checks) |
| TypeScript | typecheck clean in all packages; engine 120 tests, api 27, blockchain 23, shared 23, db 6, mcp 6, all passing |
| End-to-end on a local chain | vault, address payment, wallet payment, direct payout, EURC, with merchant and treasury balances checked on-chain |
| Read-only probes of 26 networks | chain id, token identity, EIP-712 domain, EIP-3009 and permit selectors, log window |

## Slither findings and how they were judged

| Detector | Where | Judgement |
| --- | --- | --- |
| reentrancy-balance | `PaymentRouter.pay` reads the balance, calls `receiveWithAuthorization`, then compares | Accepted. `pay` is `nonReentrant`; the token is the issuer's FiatToken, which has no transfer hooks; and the delta is *required* to equal `value` (`UnexpectedBalanceDelta`), so a stale read cannot mis-credit |
| incorrect-equality | `amount == 0`, `mode == BALANCE_IN_VAULT`, `effectiveAt == 0` | Accepted. These are sentinel checks on values the contracts set themselves, not on balances an attacker can nudge |
| timestamp | `MerchantVault` timelock | Accepted. A timelock measured in hours is not sensitive to the few seconds a validator can shift |
| unused-return, calls-loop | `InvoiceFactory.deployAndSweepBatch` | Accepted. The batch calls itself per item so one failing item cannot block the rest; the return values are also emitted as events |

## Manual review: the risks that matter, and the result

| Question | Result |
| --- | --- |
| Can anyone redirect an invoice's funds? | No. The destination, fee rate, kind, merchant and invoice are clone immutables and part of the CREATE2 address. `sweep()` has no arguments |
| Can the fee exceed the cap? | No. `MAX_FEE_BPS` is an implementation immutable (the constructor refuses more than 100%); `sweep` and `pay` revert when the committed rate exceeds it; the deploy tooling fixes and checks 100 bps (1%) |
| Can a caller make the fee leg fail on purpose (gas griefing) so the platform loses the fee? | Not in a way that helps. To make only the inner treasury call run out of gas, the caller would need less than about 30,500 gas at that point, which also leaves the outer call unable to finish the destination transfer, so the whole sweep reverts instead of skipping the fee |
| Can a blocked or hostile treasury stop settlements? | No. The fee leg is fail-open: a failing transfer emits `FeeSkipped` and the merchant receives everything. A failing **destination** transfer reverts (funds stay safely at the address) |
| Signature replay or re-pointing in wallet checkout? | The EIP-3009 nonce is a hash of the chain, router, invoice, merchant, destination, kind, treasury, fee rate, payer, value and salt, and the payer's signature covers it. Tested for tampering and replay |
| Cross-chain replay of an invoice contract? | `chainId` is in the clone arguments and the salt, and `sweep()` checks `block.chainid` |
| Front-running a deployment? | No initializer exists; a different destination gives a different address |
| Rescue of tokens? | `rescueToken` cannot touch the settlement token; the authority is the vault owner (vault kind) or the destination wallet (direct kind) |
| Stuck funds | If the issuer blocks the destination, the sweep reverts and funds wait at the address until it is unblocked. Anyone can retry the sweep |
| Admin or upgrade paths | None. No proxy, no owner on the factories or router, no `selfdestruct` |

The gas-griefing row is the EVM's 63/64 gas rule, and it is now **proven by a fuzz test** (`test_callerCannotMakeTheFeeBeSkippedByChoosingGas_fuzz`): for 30,000 random gas limits between 20,000 and 400,000, a sweep either reverts (nothing moved, a retry settles) or it succeeded **and paid the exact fee**; it never succeeded with the fee skipped.

## Off-chain review (engine)

| Area | Result |
| --- | --- |
| Ledger and settlement | Idempotency keys on every entry; reorg reversal by reference; solvency cross-check for custody; deployment self-check reads TOKEN, CHAIN_ID, VERSION, TREASURY and MAX_FEE_BPS back from every contract every 5 minutes and closes the network or token on mismatch |
| Payout wallets | Signed EIP-4361 proof stored with the row and **re-verified before every address is issued and every withdrawal** (a database-edited row yields no address, plus a critical alert); contracts, the treasury, the custody wallet and the relayer are refused as wallets; fresh re-authentication for every change; cooldown |
| Email confirmation | Optional and **off by default** (`REQUIRE_EMAIL_CONFIRMATION`). With it off, the proof, a fresh sign-in and the cooldown are the protections. This is weaker against a stolen session than the emailed link; turn it on when email is configured |
| Custody (off by default) | Separate key, ledger debited in the same transaction as the request, one withdrawal in flight, simulate-then-sign, persisted raw transaction, solvency pause. See the threat model for what it trusts |
| Relayer | Simulation before signing, live fee quotes, per-transaction cap, daily budget, operation cap, minimum balance, kill switch. Networks whose native token is not ETH-priced stay closed until limits are set explicitly |

## Findings

**Fixed during this review**

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| F1 | Medium (misleading security claim, not a code bug) | The dashboard, the risk disclosure and the threat model said the vault's `CONFIG_DELAY` gives time to react to a stolen owner key. It does not: `withdraw` is owner-only and **immediate**, so a stolen owner key drains the vault whatever the delay. The delay only governs forwarding rules | Wording corrected everywhere (dashboard dialog, risk disclosure, Terms, FAQ, Security page, README, threat model). The only real defence is a multisig or hardware-wallet owner |
| F2 | Low (hardening) | A DIRECT destination could be set to the `VaultFactory` address (an address that cannot send tokens on), in `InvoiceFactory` and `PaymentRouter`. Not exploitable (the destination is committed by the backend into the address) but cheap to forbid | Both contracts now reject it; test extended. Nothing was deployed with the earlier bytecode |
| F3 | Informational | `MerchantVault` periodic forwarding is due immediately after it is first scheduled (`lastForwardAt` starts at 0) | Left as is: it forwards only to the owner-set destination |

No critical or high finding was identified. Observations to keep in view:

1. **The vault's `CONFIG_DELAY` is not a defence against a stolen owner key** (see F1). `withdraw` is owner-only and immediate, so a stolen owner key drains the vault regardless. The delay only governs forwarding rules. Earlier wording in the dashboard, the risk disclosure and the threat model implied otherwise; it was **corrected during this review**. A stolen payout or withdrawal wallet is likewise spent at once. Use a multisig or hardware-wallet owner.
2. **A compromised backend can hand out new payment addresses** that pay an attacker (see `threat-model.md`). The stored-proof check stops database-only tampering, not a compromised API process.
3. **Finality values on the 18 chains added on 2026-10-15 are our choice** and need confirming against each chain's documentation.
4. **Custody key and relayer key are environment keys.** A KMS/HSM `SignerProvider` is not built.
5. **Fork tests against the live USDC were not re-run with the v2 contracts** (no `FORK_URL` available here).
6. Refunds of custodial payments are refused; the merchant has no account to refund from.

## What an independent audit must still cover

The contracts (especially `InvoiceDeposit`, `PaymentRouter`, `FeeSplit`, `InvoiceFactory`), the CREATE2 derivation shared by the contracts and the backend, the custody ledger and key handling, and an infrastructure review of the API and worker. Until
then: use small amounts only and do not hold meaningful value.
