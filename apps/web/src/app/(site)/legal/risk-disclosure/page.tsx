import { LegalShell } from "@/components/marketing/pages/legal-shell";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({
  title: "Risk disclosure",
  description: "Risk disclosure for Plinth: early-stage status, smart-contract risk, blockchain finality, stablecoin issuer risk and wallet security.",
  path: "/legal/risk-disclosure",
});

export default function RiskPage() {
  return (
    <LegalShell
      title="Risk disclosure"
      current="/legal/risk-disclosure"
      intro="What can go wrong when payments are settled on a blockchain, and what is unproven about Plinth."
    >
      <p>Using blockchain payments carries risks that do not exist with a bank or card processor. Read this before relying on Plinth for anything. Nothing on this site is investment, legal, tax or financial advice.</p>

      <h2>1. Plinth is early-stage</h2>
      <p>Plinth is live on Arc mainnet with USDC and EURC. Other networks are in the registry and open once their contracts are deployed. Real funds are involved. The contracts have been through a security audit; as with any smart contract, some risk remains.</p>

      <h2>2. Smart-contract risk</h2>
      <p>The contracts have been through a security audit: 87 unit, fuzz and invariant tests, a 20,000-run fuzzing campaign, static analysis and fork tests against real USDC bytecode. As with any smart contract, undiscovered bugs remain possible and could lose funds. The contracts are deliberately not upgradeable, so a bug cannot be patched in place; funds would have to be moved to new contracts, and some losses may be permanent. Keep the value you hold in Plinth in proportion to that risk.</p>

      <h2>3. Blockchain finality and reorganisations</h2>
      <p>A transaction included in a block is not always final. Some networks can reorganise recent blocks, which can reverse a payment you thought had arrived. Plinth waits for a per-network finality rule (for example a number of confirmations or the chain&apos;s finalized block) before treating funds as final, and it reverses its records if a block is reorganised before finality. These rules are judgement calls and may be wrong for a given network. A webhook of payment.confirmed means the rule was met, not that reversal is impossible.</p>

      <h2>4. Stablecoin issuer risk</h2>
      <ul>
        <li><strong>Blocklisting and pausing.</strong> The issuer of USDC or EURC can block specific addresses and pause transfers. A blocked vault, payout wallet or invoice address cannot receive or sweep funds, and Plinth cannot change that.</li>
        <li><strong>Value and redemption.</strong> USDC and EURC are claims on a third party. It can lose its peg, and redemption depends on the issuer and on the law where you are.</li>
        <li><strong>Wrong token.</strong> Only the official contract of the token a payment was created in counts as a payment on each network. Other tokens sent to a deposit address are not swept and may be recoverable only by the vault owner using a rescue function.</li>
      </ul>

      <h2>5. Wallet and key security</h2>
      <ul>
        <li>The vault owner key is the only key that can move your funds. If it is lost, nobody can recover your funds. If it is stolen, the thief can withdraw them.</li>
        <li>A multisig owner reduces both risks. The vault&apos;s delay applies only to forwarding rules: the owner key can always withdraw at once, so the delay is not a defence against a stolen owner key.</li>
        <li>Customers can lose funds by sending to the wrong network, the wrong address or a lookalike site. Funds sent to an address on a chain where it does not exist can be unrecoverable.</li>
        <li>Signing a message you do not understand can authorise a payment. Read what your wallet displays before you sign.</li>
        <li>Smart-contract wallets are not supported on the gasless path.</li>
        <li><strong>Payout wallet (direct payouts).</strong> A payout wallet is controlled directly by its key. Anyone who controls it, or who tricks the account into confirming a change, can take what arrives there. Changes need a signature from the new wallet and a fresh sign-in (and, where enabled, a confirmation link sent to your email), and they wait out a cooldown, but treat the wallet as a hot destination.</li>
        <li><strong>Compromised Plinth backend.</strong> An attacker who controls the backend cannot move funds already sitting in your vault or redirect funds sent to a payment address that has already been issued. They could, however, give customers new checkout addresses that pay the attacker, and a customer cannot check an address by looking at it. Verify what you fulfil against your own records and signed webhooks,.</li>
      </ul>

      <h2>6. Operational and infrastructure risk</h2>
      <ul>
        <li>The gateway relies on RPC providers whose answers it trusts. A faulty provider could delay or mislead detection.</li>
        <li>A single relayer signer per network limits throughput, and its gas budget and safeguards can pause settlement. Paused settlement leaves funds at the invoice address, where they remain sweepable later.</li>
        <li>Native-currency transfers sent directly to a deposit address on Arc are not detected from events and show up only through reconciliation.</li>
        <li>There is no service-level agreement, and the status page does not yet publish an incident history.</li>
      </ul>

      <h2>7. Legal and regulatory risk</h2>
      <p>The rules for accepting digital assets differ by country and change. Plinth holds no licence, registration or certification, and it does not verify customers&apos; identities or screen for sanctions. You are responsible for whether your use of the service is lawful, and for your taxes and records.</p>

      <h2>8. No guarantees</h2>
      <p>Everything here describes risks known at the date above. Other risks exist. If you do not understand these risks, do not use the service for real value.</p>
    </LegalShell>
  );
}
