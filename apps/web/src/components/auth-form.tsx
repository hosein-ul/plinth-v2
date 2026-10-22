"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { siGoogle } from "simple-icons";
import { Mail } from "lucide-react";
import { WalletIcon } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/page";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { SignInCancelled, WEB3AUTH_CLIENT_ID, getWeb3AuthIdToken } from "@/lib/web3auth-client";
import { CIRCLE_APP_ID, CircleCancelled, getCircleUserToken } from "@/lib/circle-wallets-client";
import { cn } from "@/lib/cn";

/** Turn the SDK's technical errors into something a person can act on. */
function friendly(message: string, cancelled = false): string {
  if (cancelled) return "Sign-in was cancelled.";
  if (/failed to fetch project configuration|not ready yet/i.test(message)) return "Wallet and social sign-in is not switched on for this address yet. Use email and password below, or try again later.";
  return message ? `Could not sign in: ${message.slice(0, 160)}` : "Could not sign in";
}

const rise = (i: number) => ({ animation: `slide-up-in 0.7s var(--ease-out) ${0.05 + i * 0.09}s both` });

/**
 * One centred card. Web3Auth (wallet, Google, email) is the main way in; a password form is a quiet second choice that opens
 * in place. The same card serves sign-in and sign-up.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"w3a" | "pw" | "circle" | null>(null);
  const [circleOpen, setCircleOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const signup = mode === "signup";
  const hasW3A = Boolean(WEB3AUTH_CLIENT_ID);
  const [showPw, setShowPw] = useState(!hasW3A);

  function done() {
    router.push(signup ? "/dashboard/networks?welcome=1" : "/dashboard");
    router.refresh();
  }

  async function viaCircle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("circle_email") ?? "").trim();
    setBusy("circle");
    setError(null);
    try {
      const user_token = await getCircleUserToken(email);
      const res = await fetch("/api/auth/circle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_token }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return done();
      setError(json?.error?.message ?? "Could not sign in");
    } catch (err) {
      if (!(err instanceof CircleCancelled)) setError(err instanceof Error ? err.message : "Could not sign in");
    }
    setBusy(null);
  }

  async function viaWeb3Auth() {
    setBusy("w3a");
    setError(null);
    try {
      const id_token = await getWeb3AuthIdToken();
      const res = await fetch("/api/auth/web3auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id_token }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return done();
      setError(friendly(json?.error?.message ?? ""));
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : "", err instanceof SignInCancelled));
    }
    setBusy(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("pw");
    setError(null);
    setFieldErrors({});
    const f = new FormData(e.currentTarget);
    const body = signup
      ? { business_name: String(f.get("business_name")), email: String(f.get("email")), password: String(f.get("password")) }
      : { email: String(f.get("email")), password: String(f.get("password")) };
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return done();
    setBusy(null);
    if (json?.error?.details) setFieldErrors(Object.fromEntries((json.error.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
    setError(json?.error?.message ?? "Could not sign in");
  }

  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-ground px-5 py-10">
      <div aria-hidden className="absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_45%,#000,transparent_85%)]">
        <ShaderField preset="mesh" colors={SHADER_COLORS["mesh-light"]!} spotlight={false} speed={0.5} seed={3} />
      </div>
      <main id="main" className="w-full max-w-[25rem]">
        <div className="flex justify-center" style={rise(0)}><Logo /></div>
        <div className="mt-7 rounded-[1.75rem] border border-line bg-raised p-7 shadow-float sm:p-9" style={rise(1)}>
          <h1 className="t-2 text-center text-ink" style={rise(2)}>{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-center text-[0.9375rem] text-ink-3" style={rise(3)}>{signup ? "Create your account and take your first payment on Arc." : "Sign in to your dashboard."}</p>

          {hasW3A && (
            <div className="mt-8" style={rise(4)}>
              <Button type="button" variant="primary" size="lg" className="h-12 w-full text-[0.9375rem]" loading={busy === "w3a"} disabled={busy === "pw"} onClick={viaWeb3Auth}>Continue</Button>
              <div className="mt-4 flex items-center justify-center gap-2.5 text-ink-3" aria-label="Wallets, Google and email are supported">
                <span className="grid size-7 place-items-center rounded-full bg-sunk"><svg role="img" aria-label="Google" viewBox="0 0 24 24" className="size-3.5" fill="currentColor"><path d={siGoogle.path} /></svg></span>
                <span className="grid size-7 place-items-center rounded-full bg-sunk"><Mail className="size-3.5" aria-label="Email" /></span>
                <span className="grid size-7 place-items-center rounded-full bg-sunk"><WalletIcon id="metamask" size={16} /></span>
                <span className="grid size-7 place-items-center rounded-full bg-sunk"><WalletIcon id="walletconnect" size={16} /></span>
                <span className="text-xs">and more</span>
              </div>
            </div>
          )}

          {hasW3A && (
            <div className="mt-6 text-center" style={rise(5)}>
              <button type="button" aria-expanded={showPw} onClick={() => setShowPw((v) => !v)} className="text-sm text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
                {showPw ? "Hide email and password" : signup ? "Sign up with email and password instead" : "Use email and password instead"}
              </button>
            </div>
          )}

          {CIRCLE_APP_ID && (
            <div className="mt-3 text-center" style={rise(5)}>
              <button type="button" aria-expanded={circleOpen} onClick={() => setCircleOpen((v) => !v)} className="text-sm text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
                {circleOpen ? "Hide the email code option" : "Get a sign-in code by email (Circle Wallets)"}
              </button>
              {circleOpen && (
                <form onSubmit={viaCircle} className="mt-4 space-y-3 text-left" noValidate>
                  <Field label="Email" htmlFor="circle_email">
                    <Input id="circle_email" name="circle_email" type="email" required autoComplete="email" />
                  </Field>
                  <Button type="submit" variant="secondary" size="lg" className="w-full" loading={busy === "circle"} disabled={busy === "pw" || busy === "w3a"}>Send code</Button>
                  <p className="text-xs text-ink-3">Circle sends a one-time code and creates a wallet you control. Plinth never sees the code.</p>
                </form>
              )}
            </div>
          )}

          <div className={cn("grid transition-[grid-template-rows,opacity] duration-[420ms] ease-[var(--ease-out)]", showPw ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} aria-hidden={!showPw} inert={!showPw}>
            <div className="overflow-hidden">
              <form onSubmit={submit} className={cn("space-y-4 pb-1", hasW3A ? "pt-6" : "pt-8")} noValidate>
                {signup && (
                  <Field label="Business name" htmlFor="business_name" error={fieldErrors.business_name}>
                    <Input id="business_name" name="business_name" required autoComplete="organization" aria-invalid={!!fieldErrors.business_name} />
                  </Field>
                )}
                <Field label="Email" htmlFor="email" error={fieldErrors.email}>
                  <Input id="email" name="email" type="email" required autoComplete="email" aria-invalid={!!fieldErrors.email} />
                </Field>
                <Field label="Password" htmlFor="password" hint={signup ? "At least 12 characters." : undefined} error={fieldErrors.password}>
                  <Input id="password" name="password" type="password" required minLength={signup ? 12 : 1} autoComplete={signup ? "new-password" : "current-password"} aria-invalid={!!fieldErrors.password} />
                </Field>
                <Button type="submit" variant={hasW3A ? "secondary" : "primary"} size="lg" className="w-full" loading={busy === "pw"} disabled={busy === "w3a"}>{signup ? "Create account" : "Sign in"}</Button>
              </form>
            </div>
          </div>

          {error && <div className="mt-5"><Notice tone="bad"><span role="alert">{error}</span></Notice></div>}
        </div>
        <p className="mt-6 text-center text-sm text-ink-3" style={rise(6)}>
          {signup ? "Already have an account? " : "New here? "}
          <Link href={signup ? "/login" : "/signup"} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">{signup ? "Sign in" : "Create an account"}</Link>
        </p>
      </main>
    </div>
  );
}
