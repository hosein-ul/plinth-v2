import { NextRequest, NextResponse } from "next/server";
import { ENV_COOKIE } from "@/lib/server-api";
import { isSameOrigin } from "@/lib/request-guard";

/** Switch the dashboard between test (testnets) and live (mainnets) data. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
  const { env } = (await req.json().catch(() => ({}))) as { env?: string };
  const out = NextResponse.json({ env: env === "live" ? "live" : "test" });
  out.cookies.set(ENV_COOKIE, env === "live" ? "live" : "test", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return out;
}
