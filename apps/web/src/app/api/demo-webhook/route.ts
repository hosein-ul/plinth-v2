import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Reference webhook receiver for local development. It verifies the Plinth-Signature header exactly as
 * a merchant backend should and keeps the last events in memory so you can see deliveries arrive.
 * Set DEMO_WEBHOOK_SECRET to the endpoint's signing secret to enforce verification.
 */
const events: { receivedAt: string; verified: boolean | null; type: string; id: string; payment: string | null }[] = [];

function verify(secret: string, body: string, header: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const got = Buffer.from(parts.v1, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** The reference receiver is a development aid. A production deployment serves it only when it is given a secret to verify with. */
const enabled = () => process.env.NODE_ENV !== "production" || !!process.env.DEMO_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.text();
  const secret = process.env.DEMO_WEBHOOK_SECRET;
  const sig = req.headers.get("plinth-signature") ?? "";
  const verified = secret ? verify(secret, body, sig) : null;
  if (secret && !verified) return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  let evt: { type?: string; id?: string; data?: { object?: { id?: string } } };
  try {
    evt = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  events.unshift({ receivedAt: new Date().toISOString(), verified, type: evt.type ?? "", id: evt.id ?? "", payment: evt.data?.object?.id ?? null });
  events.length = Math.min(events.length, 50);
  return NextResponse.json({ received: true });
}

export async function GET() {
  if (!enabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ data: events });
}
