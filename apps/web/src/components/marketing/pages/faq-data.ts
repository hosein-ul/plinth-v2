/** FAQ content as plain strings so the same text feeds the accordion and the FAQPage JSON-LD. Every answer is checked against the repository docs. */
export interface Faq { q: string; a: string }
export interface FaqGroup { id: string; title: string; items: Faq[] }

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "What is Plinth?",
        a: "Plinth is a non-custodial stablecoin payment gateway: USDC on every network, and EURC on Arc. Each payment gets a unique address, or the customer signs a gasless authorization from a wallet. A watcher verifies the transfer on-chain, and a restricted relayer sweeps the funds, minus a 0.20% platform fee, to a vault that you own or to a payout wallet you choose. The gateway holds no key that can move merchant funds.",
      },
      {
        q: "Can I accept real money today?",
        a: "Yes, on Arc mainnet, in USDC and EURC. The contracts have been through a security audit. Other networks open one at a time, each after its own on-chain check.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    items: [
      {
        q: "What can customers pay with?",
        a: "The token the payment was created in: USDC on every network, and EURC on Arc, where Arc lists it. Customers can pay from a connected browser wallet with one gasless signature (where the token supports it), or send the token to the unique address on the checkout page. A different token sent to a deposit address is recorded as the wrong asset and is never swept.",
      },
      {
        q: "What happens if a customer pays too little, too much or too late?",
        a: "Several transfers add up. If the payment expires with only part of the amount it becomes underpaid. More than the amount is overpaid, with the excess recorded and refundable. Funds that become final after expiry are a late payment. Each case emits its own webhook event, so nothing is silently absorbed.",
      },
      {
        q: "What if a customer sends funds on the wrong network?",
        a: "Funds sent to an address on a chain where the invoice contract does not exist cannot be matched automatically, and nobody holds a key for that address, so they may be unrecoverable. The checkout warns about this prominently. Keep the transaction hash and contact support.",
      },
      {
        q: "How do refunds work?",
        a: "A refund is a new transfer that you send from the account that received the funds: your vault, or your payout wallet if you use direct payouts. Plinth cannot move those funds for you. You record a refund request, send the transfer, and submit its transaction hash. The refund completes only after the transfer is verified on-chain. The platform fee is not refunded, so a refund can return at most the net amount you received.",
      },
    ],
  },
  {
    id: "security",
    title: "Security and custody",
    items: [
      {
        q: "Who holds the money?",
        a: "You do. Funds go from the customer to a per-invoice address and are swept, minus the platform fee, to the destination committed into that address: either a MerchantVault whose only authority is its owner, or a payout wallet you chose and confirmed by email. The gateway and its relayer have no role in either, so they cannot withdraw, change the owner or choose a recipient for an address that already exists.",
      },
      {
        q: "What if the Plinth backend or relayer key is compromised?",
        a: "A compromised relayer key cannot redirect funds: sweep() takes no arguments and only sends to the destination baked into the invoice contract. It cannot withdraw from a vault or change its rules, and its gas budget is capped. A total compromise of the backend is different: it cannot take funds at addresses that were already issued, but it could hand out new checkout addresses that pay an attacker, and a customer cannot verify an address by looking at it. Mitigations exist (the engine checks your signed payout choice before deriving an address, which stops tampering with the database alone) but they do not stop a compromised API process. With direct payouts the payout wallet's own key controls the money. The contracts are unaudited.",
      },
      {
        q: "Have the contracts been audited?",
        a: "Yes. The security audit covered 87 tests (unit, fuzz, invariants), a 20,000-run fuzzing campaign, static analysis with Slither (no high or medium findings) and fork tests against the real USDC bytecode.",
      },
      {
        q: "Can my funds be frozen?",
        a: "Possibly, by the token issuer. USDC and EURC can be paused or blocklisted by their issuer, and a blocked vault, payout wallet or invoice address cannot receive or sweep funds. Plinth has no control over this. The risk disclosure covers it in more detail.",
      },
    ],
  },
  {
    id: "settlement",
    title: "Settlement and fees",
    items: [
      {
        q: "How long until funds reach my vault?",
        a: "It depends on the network's finality rule: one confirmation on Arc, and the finalized block on Ethereum (about 13 minutes). After that the relayer sweeps the funds in one transaction. No settlement-time guarantee or SLA is offered.",
      },
      {
        q: "What does Plinth cost?",
        a: "A platform fee of 0.20% of each payment, rounded down to the token's smallest unit, taken inside the settlement transaction and sent to the Plinth treasury. The contract caps any fee at 1% and that cap cannot change. If the treasury transfer fails, you receive the full amount and the fee is not charged for that payment. The relayer's gas is paid by the gateway and recorded, not billed.",
      },
      {
        q: "What are the two payout modes?",
        a: "Vault mode settles into a MerchantVault that only your owner address controls, with an optional settlement delay. Direct mode settles straight to a payout wallet you choose. Direct has no vault: the wallet's own key controls the money. It needs a signature from the wallet and a fresh sign-in (and, where an operator enables it, a confirmation link sent to your email), and a cooldown runs before it takes effect. New payments use the destination committed when their address was issued.",
      },
    ],
  },
  {
    id: "developers",
    title: "Developers",
    items: [
      {
        q: "How do I know a payment succeeded?",
        a: "Listen for signed webhooks, not redirects. Fulfil on payment.confirmed for speed, or on payment.completed once the funds are confirmed inside your vault. Verify the Plinth-Signature header (HMAC-SHA256 over the timestamp and raw body), reject timestamps older than five minutes and deduplicate on event.id.",
      },
      {
        q: "Is there an OpenAPI document or an SDK?",
        a: "The API publishes an OpenAPI 3.1 document at /v1/openapi.json. There is no official SDK or store plugin yet, so you call the REST API directly.",
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    items: [
      {
        q: "Does Plinth do KYC, KYB or sanctions screening?",
        a: "No. Signing up asks for a business name, an email address and a password, and the engine contains no identity verification or sanctions screening. Plinth is non-custodial software and does not hold your funds. If your business needs identity checks or sanctions screening, those controls are your responsibility.",
      },
      {
        q: "Is Plinth licensed, registered or certified?",
        a: "No. There is no licence, registration, SOC 2, ISO or similar certification, and Plinth is not a licensed financial institution. Whether your use of a payment gateway needs a licence depends on your jurisdiction, so seek your own advice.",
      },
    ],
  },
];

export const ALL_FAQ: Faq[] = FAQ_GROUPS.flatMap((g) => g.items);
