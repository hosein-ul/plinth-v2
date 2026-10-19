import { LegalShell } from "@/components/marketing/pages/legal-shell";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({
  title: "Privacy policy",
  description: "Privacy policy for Plinth: what data the service processes, why, which cookies it sets and which third parties receive requests.",
  path: "/legal/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy policy"
      current="/legal/privacy"
      intro="What Plinth collects, why, and who else sees it."
    >
      <h2>1. Who is responsible</h2>
      <p>The team behind Plinth decides why and how the data below is used. Contact: see the contact page.</p>

      <h2>2. What we process</h2>
      <h3>Merchant account data</h3>
      <ul>
        <li>Business name and sign-in email address.</li>
        <li>A password, stored only as a scrypt hash. API keys and session tokens are stored only as SHA-256 hashes.</li>
        <li>Team members you add: their email addresses and roles.</li>
        <li>Wallet addresses you give us as vault owners or payout destinations.</li>
      </ul>
      <h3>Payment and invoice data</h3>
      <ul>
        <li>Amounts, order references, descriptions, and any metadata you attach to a payment (up to 20 key and value pairs).</li>
        <li>For invoices: the customer&apos;s name and email address, the memo and the line items you enter.</li>
        <li>The optional customer email on a payment.</li>
        <li>Blockchain facts about each payment: the paying address, transaction hashes, amounts and block data. This data is public on the blockchain.</li>
        <li>Webhook endpoints (URLs), delivery attempts and response codes. Webhook signing secrets are encrypted at rest.</li>
      </ul>
      <h3>Technical data</h3>
      <ul>
        <li>The IP address of requests, used for rate limiting and recorded on security-relevant audit events such as sign-in and sign-up.</li>
        <li>Audit events for sensitive actions, with secrets, tokens and signatures redacted.</li>
      </ul>
      <p>We do not ask for a postal address, date of birth, identity documents or financial account details, and the service does not run identity or sanctions checks.</p>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To run your account, detect and verify payments, move funds into your vault, and send you webhooks.</li>
        <li>To keep the service secure, prevent abuse and investigate incidents.</li>
        <li>To answer support requests you send us.</li>
      </ul>
      <p>We process data to run the service you asked for, to keep it secure and to meet legal obligations. We do not sell personal data, and we do not use it for advertising or profiling.</p>

      <h2>4. Cookies and similar technologies</h2>
      <p>The site sets only functional cookies, and only for signed-in merchants:</p>
      <ul>
        <li><strong>plinth_session</strong> keeps you signed in. It is HttpOnly, SameSite=Lax, secure in production, and lasts 7 days.</li>
        <li><strong>plinth_env</strong> remembers whether the dashboard is showing test or live data. It is HttpOnly, SameSite=Lax and lasts 30 days.</li>
      </ul>
      <p>The code contains no analytics, advertising or tracking cookies and no third-party tracking scripts, so there is no consent banner. If that changes, this policy and the site will change first. Visitors who are not signed in receive no cookies from us.</p>

      <h2>5. Other parties who receive data</h2>
      <ul>
        <li><strong>Font providers.</strong> Pages load the General Sans typeface from Fontshare and the JetBrains Mono typeface from Google Fonts. Your browser sends those providers its IP address and the usual request headers when it fetches them.</li>
        <li><strong>Blockchain networks and RPC providers.</strong> Transactions are public and permanent. Our servers query RPC providers for chain data, which can include your payment addresses.</li>
        <li><strong>Your wallet.</strong> If you pay with a connected wallet, your wallet software and its provider see the signing request. We receive the address and the signed authorization.</li>
        <li><strong>Hosting and infrastructure providers.</strong> They host the application, the database and the logs.</li>
        <li><strong>Webhook recipients.</strong> Payment data is sent to the endpoints you register.</li>
      </ul>

      <h2>6. Blockchain data cannot be erased</h2>
      <p>Anything written to a blockchain, such as a transfer from a customer&apos;s address to an invoice address, is public and cannot be altered or deleted by us or anyone else. We can delete or anonymise data in our own systems, subject to the next section.</p>

      <h2>7. How long we keep it</h2>
      <p>The system keeps payment records, ledger entries and audit events without an automatic deletion job. The session cookie lasts 7 days.</p>

      <h2>8. Your rights</h2>
      <p>Depending on where you live, you may have the right to access, correct, delete, export or object to the use of your personal data, and to complain to a data protection authority. Contact [privacy contact]. If you are a merchant&apos;s customer, ask the merchant first: they decide what to do with the data you gave them.</p>

      <h2>9. Security</h2>
      <p>Passwords, keys and secrets are hashed or encrypted as described above, the dashboard session is HttpOnly, and requests are rate limited. No system is perfectly secure, and the service is early-stage. Report problems through the process on the security page.</p>

      <h2>10. Changes</h2>
      <p>We will update this page and its date when we change how we handle data.</p>
    </LegalShell>
  );
}
