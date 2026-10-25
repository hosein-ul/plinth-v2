# Plinth: launch copy

Every claim below comes from the repo (README, docs/, deployment records). Nothing here claims customers, volume or an audit, because there are none.

---

## X posts

**Post 1: the launch (attach the 50 s reel)**

> Getting paid in stablecoins should be simple.
>
> Plinth: one link, a unique address for every order, proof from the chain, and the money lands in a vault only you can open.
>
> Non-custodial. USDC and EURC. Built on Arc.
>
> plinth.zerolayer.online

**Post 2: how a payment works**

> Every order on Plinth gets its own deposit address.
>
> The address exists before any contract does (CREATE2), so there is nothing to fund and nothing to babysit.
>
> A relayer pays the gas and sweeps it. The sweep() call takes no arguments, so nobody can pick a recipient.

**Post 3: the claim that matters**

> Plinth never holds a key that can move your money.
>
> The vault has one owner: you. No proxy, no admin role, no upgrade path, no delegatecall. The dashboard shows "Gateway admin role: none" and checks it against the contract.

**Post 4: Arc-specific**

> Building on Arc taught us a few things:
>
> • gas is USDC (18 decimals native, 6 on the ERC-20 view)
> • fees under 20 gwei are rejected, so our relayer enforces that floor
> • native USDC deposits arrive as system logs (EIP-7708), so we avoid counting a payment twice

---

## Arc House article

### Plinth: non-custodial stablecoin payments on Arc

**In one paragraph.** Plinth is a payment gateway for USDC and EURC on Arc. A merchant creates a payment link or calls one API endpoint. Every order gets its own deposit address, the chain proves the payment, and the money is swept into a vault only the merchant can withdraw from. The gateway holds no key that can move merchant funds.

**The problem.** Accepting stablecoins usually means choosing between two compromises. A custodial processor holds your balance, so it can freeze it or delay it. A hand-rolled "send to this wallet" page leaves you matching transfers to orders yourself. We wanted a third option: automatic reconciliation without custody.

**How a payment works.**

1. The merchant creates an order (API, payment link, or from an AI assistant over MCP).
2. Plinth returns a checkout URL and a deposit address for that order only.
3. The address is computed offline with CREATE2 and cross-checked against the deployed factory's `predict()` before a customer ever sees it. It exists before the contract does, so there is nothing to fund.
4. The customer pays by sending USDC to the address (or QR), or with one gasless signature (EIP-3009).
5. A watcher verifies the transfer: the log, the receipt, the official token contract and finality.
6. A relayer pays the gas and calls `deployAndSweep()`. The fee goes to the treasury and the rest goes to the merchant's vault in the same transaction.
7. The merchant receives signed webhooks: `payment.detected`, `payment.confirmed`, `settlement.submitted`, `payment.completed`.

**Why it is non-custodial.** The destination, the fee and the token are part of the deposit address itself, so a different recipient is a different address. `sweep()` takes no arguments. The merchant's vault has a single owner, no proxy, no admin role, no upgrade path, no `delegatecall` and no `selfdestruct`. The dashboard reads the deployed contracts back from the chain every few minutes and closes the network if anything differs.

**What we learned building on Arc.**

- Gas is paid in USDC. The native balance is 18 decimals while the ERC-20 interface of the same balance is 6, so the relayer's accounting handles both views.
- Arc rejects `maxFeePerGas` below 20 gwei, so the relayer enforces that floor and caps spend per transaction and per day.
- Native USDC deposits appear as system logs (EIP-7708). We count those and stop reading the matching ERC-20 event as a second payment.
- Creating a vault costs about 0.03 USDC in gas, and a deploy-and-sweep costs roughly 178,000 to 198,000 gas on Arc Testnet. A customer who holds no gas token can still pay.
- USDC and EURC each get their own set of four contracts, because the token is an immutable of the implementation.

**What is live.**

- Arc mainnet (chain 5042) and Arc Testnet (chain 5042002): VaultFactory, InvoiceDeposit, InvoiceFactory and PaymentRouter for USDC and EURC, deployed and byte-verified. The acceptance run on testnet covers a vault, an address payment, a gasless wallet payment, a direct payout and 14 signed webhooks.
- A hosted checkout, a merchant dashboard (payments, settlements, payment links, invoices, refunds, webhooks, audit log, team roles), a REST API and an OpenAPI spec.
- Three ways to be paid: a vault (default), direct to your own proven wallet, or an opt-in custodial mode that is off by default.
- A hosted MCP server with 29 tools. It has no tool that changes where money goes, creates keys or edits the team.

**The fee.** 0.20% by default, taken inside the settlement transaction. The contract caps it at 1% and that cap is fixed at deployment. If the treasury transfer fails, the merchant receives the full amount and the contract emits `FeeSkipped`.

**Honest status.** Plinth is **not independently audited**. We ran an internal review, Slither with 80 detectors (no high or medium findings), 89 Foundry tests including fuzz and invariant suites, and a heavy campaign of 20,000 fuzz runs per test. None of that replaces an audit. A compromised backend could not take funds already at issued addresses or in vaults, but it could hand out new checkout addresses that pay an attacker, and the relayer key is still an environment key without KMS. Our threat model says exactly what is and is not protected. Please start with small amounts.

**What we would like feedback on.**

- Which checkout flows matter most on Arc: wallet signature, address or QR, or a Telegram Mini App.
- Whether EURC invoices are something merchants on Arc ask for.
- What you would want from a vault policy (delayed forwarding, a multisig owner, payout schedules).

**Links.** Site: plinth.zerolayer.online · Docs and API guide: in the repository · Contracts and deployment records: `contracts/` and `deployments/`.
