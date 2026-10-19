import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/server-api";
import { cleanTarget, clientIp, isSameOrigin } from "@/lib/request-guard";

/** Unauthenticated gateway for hosted checkout, payment links and the status page only. */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = cleanTarget(path);
  if (!target || !/^(checkout|links|status|auth\/email\/confirm|payout\/confirm)(\/|$)/.test(target)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  if (req.method !== "GET") {
    if (!isSameOrigin(req) || req.headers.get("x-plinth-csrf") !== "1") {
      return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
    }
  }
  const res = await fetch(`${API_URL}/public/${target}${req.nextUrl.search}`, {
    method: req.method,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json", "x-forwarded-for": clientIp(req) },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export { handle as GET, handle as POST };
