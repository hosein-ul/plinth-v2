import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/server-api";
import { isSameOrigin } from "@/lib/request-guard";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await fetch(`${API_URL}/v1/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => undefined);
  const out = NextResponse.json({ ok: true });
  out.cookies.delete(SESSION_COOKIE);
  return out;
}
