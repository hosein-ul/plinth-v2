import Link from "next/link";
import { Handshake, LifeBuoy, ShieldAlert } from "lucide-react";
import { PageIntro } from "@/components/marketing/chrome";
import { C } from "@/components/marketing/code";
import { wrap } from "@/components/marketing/parts";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({ title: "Contact and support", description: "How to reach the people behind a Plinth deployment: payment support, early access and private security reports.", path: "/contact" });

const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
const security = process.env.NEXT_PUBLIC_SECURITY_EMAIL;
const link = "font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";

export default function ContactPage() {
  return (
    <>
      <PageIntro eyebrow="Support" title="Reach a person">
        Include the payment ID, the network and the transaction hash. Those three facts let us trace any payment end to end.
      </PageIntro>
      <div className={cn(wrap, "grid gap-4 py-14 md:grid-cols-2 lg:grid-cols-3")}>
        <section className="card p-6 sm:p-8">
          <span className="grid size-11 place-items-center rounded-[13px] bg-ink text-on-ink shadow-btn"><LifeBuoy className="size-5" aria-hidden /></span>
          <h2 className="t-3 mt-5">Customer or merchant support</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            {email ? <>Email <a className={link} href={`mailto:${email}`}>{email}</a>.</> : <>Message the founder on X: <a className={link} href="https://x.com/andy1eth" target="_blank" rel="noopener noreferrer">@andy1eth</a>. If you are paying a merchant, contact that merchant directly.</>}
          </p>
          <p className="mt-4 text-sm text-ink-3">Funds sent to the wrong network or in the wrong token cannot be matched automatically. Keep your transaction hash.</p>
        </section>
        <section className="card p-6 sm:p-8">
          <span className="grid size-11 place-items-center rounded-[13px] bg-ink text-on-ink shadow-btn"><ShieldAlert className="size-5" aria-hidden /></span>
          <h2 className="t-3 mt-5">Security reports</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            {security ? <>Report vulnerabilities privately to <a className={link} href={`mailto:${security}`}>{security}</a>.</> : <>Send a private message to <a className={link} href="https://x.com/andy1eth" target="_blank" rel="noopener noreferrer">@andy1eth</a> on X. Please do not post vulnerabilities publicly.</>}
          </p>
          <p className="mt-4 text-sm text-ink-3">Read the <Link className={link} href="/security">security model</Link> first, including its stated limitations.</p>
        </section>
        <section className="card p-6 sm:p-8">
          <span className="grid size-11 place-items-center rounded-[13px] bg-ink text-on-ink shadow-btn"><Handshake className="size-5" aria-hidden /></span>
          <h2 className="t-3 mt-5">Early access</h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            {email ? <>Email <a className={link} href={`mailto:${email}`}>{email}</a> with your expected volume, chains and how you take payments today.</> : <>Use the support address once the operator publishes it. Include your expected volume, chains and how you take payments today.</>}
          </p>
          <p className="mt-4 text-sm text-ink-3">You can <Link className={link} href="/signup">create an account</Link> now; no response-time commitment is made yet.</p>
        </section>
      </div>
    </>
  );
}
