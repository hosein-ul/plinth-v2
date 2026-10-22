import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/server-api";
import { clientIp, isSameOrigin } from "@/lib/request-guard";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
  const res = await fetch(`${API_URL}/v1/auth/circle`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": clientIp(req) }, body: await req.text(), cache: "no-store" });
  const json = await res.json();
  if (!res.ok) return NextResponse.json(json, { status: res.status });
  const out = NextResponse.json({ user: json.user, merchant: json.merchant });
  out.cookies.set(SESSION_COOKIE, json.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return out;
}
