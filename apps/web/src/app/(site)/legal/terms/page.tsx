import { LegalShell } from "@/components/marketing/pages/legal-shell";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({
  title: "Terms of service",
  description: "The terms for using the Plinth gateway: the service, your account, fees, acceptable use, liability and contact.",
  path: "/legal/terms",
});

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of service"
      current="/legal/terms"
      intro="The rules for using Plinth, in plain English."
    >
      <h2>1. Who these terms are with</h2>
      <p>These terms are between you and the team behind Plinth (&quot;we&quot;, &quot;us&quot;). Plinth is the name of the software and service we run. If you use Plinth on behalf of a business, you confirm that you can bind that business.</p>

      <h2>2. What the service is, today</h2>
      <p>Plinth is a non-custodial stablecoin payment gateway (USDC, and EURC on Arc). It gives each payment a deposit address or a wallet checkout, watches the blockchain, and uses a restricted relayer to move confirmed funds, minus the platform fee, into a vault that you own or to a payout wallet that you chose.</p>
      <p>The service is live on Arc mainnet. The smart contracts have been through a security audit. We give no uptime promise and no service-level agreement.</p>

      <h2>3. Your account</h2>
      <ul>
        <li>Give us accurate details: a business name, an email address and a password of at least 12 characters.</li>
        <li>Keep your password and API keys secret. You are responsible for what is done with them, including by teammates you add.</li>
        <li>Roles on your account (owner, admin, developer, viewer) limit what each person can do. You decide who gets which role.</li>
      </ul>

      <h2>4. Your vault, your payout wallet and your keys</h2>
      <p>The vault is owned by the wallet address you name when you create it. We never hold a key that can withdraw from it. This means we cannot recover funds if you lose that key, send funds for you, or reverse a withdrawal. Using a multisig as owner is strongly recommended.</p>
      <p>You may instead choose direct payouts, where each payment settles straight to a payout wallet you control. Direct payouts need a signature from that wallet and a fresh sign-in (and, where enabled, a confirmation link sent to your email), and a change takes effect after a waiting period. A vault can delay changes to its forwarding rules, but its owner key can still withdraw at once; a payout wallet is controlled directly by its key. Treat either key as the funds themselves. The destination of a payment address is fixed when the address is issued. A custodial payout mode, in which Plinth would hold your balance until you withdraw it, is not offered; if it is ever offered, separate terms will apply before you can use it. You are responsible for the wallet you name: funds sent to a wrong or lost address cannot be recovered by us.</p>
      <p>You are responsible for the address you give us. A mistake in it cannot be corrected by us.</p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not use Plinth for anything unlawful, or to receive funds you are not entitled to receive.</li>
        <li>Do not use it to evade sanctions, or to deal with people or places you are legally barred from dealing with.</li>
        <li>Do not attack, overload or probe the service outside the process in our security policy, or try to bypass rate limits, permissions or the relayer&apos;s safeguards.</li>
        <li>Do not use the service for unlawful activity or for assets you do not control.</li>
      </ul>

      <h2>6. Fees</h2>
      <p>Plinth takes a platform fee of 0.20% of each payment, rounded down to the token&apos;s smallest unit. The fee is taken by the settlement contract in the same transaction that delivers the payment, and it is paid to the Plinth treasury address. The contract fixes a maximum of 1% that cannot be changed after deployment. We may agree a different rate with you, within that maximum; the rate is written into each payment address when the address is issued, so a later change affects only new payments. If the fee transfer fails, you receive the full amount and no fee is charged for that payment.</p>
      <p>The fee is not refunded. A refund can return at most the net amount you received. Network fees for deployments and sweeps are paid by the relayer and are not billed today. If we change the default fee, we will publish the new rate before it applies to new payments.</p>

      <h2>7. Your customers and your obligations</h2>
      <p>You are the seller. You are responsible for your products and prices, your refund and consumer-law obligations, your taxes and accounting, and any licence your business needs to accept digital assets. Plinth does not verify your customers&apos; identities or screen them against sanctions lists.</p>

      <h2>8. Availability, changes and suspension</h2>
      <p>We may change, pause or stop any part of the service, including a network, at any time. We may pause the relayer or restrict an account to protect people or the service, or if you break these terms. Doing so does not touch funds that are already in your vault, which only your key can move, or that were already paid out to your payout wallet.</p>
      <p>Payments can be delayed or missed if a network, an RPC provider, the token issuer or our systems fail. Check the status page and rely on signed webhooks and the payment detail, not on a redirect.</p>

      <h2>9. No warranty, limited liability</h2>
      <p>The service is provided &quot;as is&quot;, as an early-stage product. To the extent the law allows, we do not promise that it is error-free or secure, and we are not liable for losses caused by smart-contract defects, blockchain or token-issuer events, wallet or key compromise, or your use of the service. Nothing here limits liability that cannot be limited by law.</p>

      <h2>10. Ending your account</h2>
      <p>You can stop using Plinth at any time. We may close accounts that break these terms. Your vault remains yours and keeps working on-chain whatever happens to your account.</p>

      <h2>11. Changes to these terms</h2>
      <p>We will update this page and its date when the terms change. Material changes will be announced before they take effect where we can.</p>

      <h2>12. Governing law</h2>
      <p>These terms are governed by the law of the jurisdiction in which the operating entity is established. Disputes are first raised through the contact details below.</p>

      <h2>13. Contact</h2>
      <p>Questions about these terms: see the contact page.</p>
    </LegalShell>
  );
}
