import { NextRequest, NextResponse } from "next/server";
import { API_URL, ENV_COOKIE, SESSION_COOKIE } from "@/lib/server-api";
import { cleanTarget, isSameOrigin } from "@/lib/request-guard";

/**
 * Same-origin gateway for the dashboard. It attaches the session token from the httpOnly cookie, so
 * browser JavaScript never holds a credential. State-changing calls must come from our own origin and
 * carry the custom CSRF header (a cross-site form cannot set it).
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = cleanTarget(path);
  if (!target || !target.startsWith("v1/")) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });

  if (req.method !== "GET") {
    if (!isSameOrigin(req) || req.headers.get("x-plinth-csrf") !== "1") {
      return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
    }
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } }, { status: 401 });

  const headers = new Headers({ authorization: `Bearer ${token}`, "x-plinth-environment": req.cookies.get(ENV_COOKIE)?.value === "live" ? "live" : "test" });
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const idem = req.headers.get("idempotency-key");
  if (idem) headers.set("idempotency-key", idem);

  const res = await fetch(`${API_URL}/${target}${req.nextUrl.search}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
