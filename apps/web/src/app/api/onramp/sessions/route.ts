import { NextRequest, NextResponse } from "next/server";
import { createAppServerKit, createSessionRouteHandler } from "@circle-fin/app-kit/server";
import { API_URL } from "@/lib/server-api";

/**
 * Mints a short-lived Circle Onramp session so a payer can buy USDC with a card, straight to their own wallet.
 * The API key stays here. A session is only minted for a payment that really exists and is still open, from this site's own pages,
 * and to a well-formed address, so the route cannot be used as a free session factory.
 */
const hits = new Map<string, number[]>();
const limited = (ip: string): boolean => {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 10;
};

let handler: ((req: Request) => Promise<Response>) | null = null;
function build(): (req: Request) => Promise<Response> {
  const server = createAppServerKit({
    onramp: {
      apiKey: process.env.CIRCLE_API_KEY!,
      ...(process.env.ONRAMP_API_BASE_URL ? { baseUrl: process.env.ONRAMP_API_BASE_URL } : {}),
      ...(process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL ? { widgetBaseUrl: process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL } : {}),
      ...(process.env.ONRAMP_REFERRER_DOMAIN ? { referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN } : {}),
    },
  });
  return createSessionRouteHandler(server.onramp, {
    authorize: async (request) => {
      const origin = request.headers.get("origin");
      try {
        if (!origin || new URL(origin).host !== request.headers.get("host")) return false;
      } catch {
        return false;
      }
      const body = (await request.clone().json().catch(() => null)) as { appUserId?: unknown; destinationAddress?: unknown } | null;
      if (!body || typeof body.appUserId !== "string" || !/^pi_[a-f0-9]{32}$/.test(body.appUserId)) return false;
      if (typeof body.destinationAddress !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(body.destinationAddress)) return false;
      const res = await fetch(`${API_URL}/public/checkout/${body.appUserId}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return false;
      const p = (await res.json().catch(() => null)) as { status?: string } | null;
      return !!p && !["SETTLED", "EXPIRED", "CANCELED", "CANCELLED"].includes(String(p.status));
    },
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.CIRCLE_API_KEY) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "Buying USDC is not available here yet." } }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a few minutes." } }, { status: 429 });
  handler ??= build();
  return handler(req);
}
