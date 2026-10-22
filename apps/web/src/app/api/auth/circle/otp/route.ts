import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/server-api";
import { clientIp, isSameOrigin } from "@/lib/request-guard";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
  const res = await fetch(`${API_URL}/v1/auth/circle/otp`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": clientIp(req) }, body: await req.text(), cache: "no-store" });
  return NextResponse.json(await res.json(), { status: res.status });
}
