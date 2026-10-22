import { randomUUID } from "node:crypto";
import { EngineError, type Engine } from "./context";
import type { Web3AuthIdentity } from "./web3auth";

/**
 * Sign in with Circle User-Controlled Wallets (email one-time code). The browser runs Circle's own hosted code screen; we never see
 * the code. What we trust is only what Circle's API confirms to us with our API key: that the user token is valid and which Circle
 * user it belongs to. The key stays on the server.
 */
const BASE = "https://api.circle.com/v1/w3s";

async function circle<T>(e: Engine, method: "GET" | "POST", path: string, opts: { userToken?: string; body?: unknown } = {}): Promise<T> {
  const key = e.cfg.circleApiKey;
  if (!key) throw new EngineError("NOT_CONFIGURED", "Circle sign-in is not configured on this server", 503);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(opts.userToken ? { "x-user-token": opts.userToken } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  } as RequestInit);
  const json = (await res.json().catch(() => ({}))) as { data?: T; message?: string; code?: number };
  if (!res.ok) {
    e.log.warn("circle request refused", { path, status: res.status, code: json.code });
    // 155104 / 155101: the token is wrong or expired. Anything else is not the user's doing.
    if (res.status === 401 || res.status === 403 || json.code === 155104 || json.code === 155101) throw new EngineError("INVALID_TOKEN", "The sign-in was rejected. Sign in again.", 401);
    if (res.status === 429) throw new EngineError("RATE_LIMITED", "Too many attempts. Try again in a minute.", 429);
    throw new EngineError("CIRCLE_ERROR", "Circle could not complete this request. Try again.", 502);
  }
  if (!json.data) throw new EngineError("CIRCLE_ERROR", "Circle returned an unexpected response.", 502);
  return json.data;
}

export interface CircleOtpStart {
  deviceToken: string;
  deviceEncryptionKey: string;
  otpToken: string;
}

/** Circle sends the one-time code to the address and returns the tokens the browser needs to open its code screen. */
export async function circleRequestOtp(e: Engine, input: { device_id: string; email: string }): Promise<CircleOtpStart> {
  return circle<CircleOtpStart>(e, "POST", "/users/email/token", { body: { idempotencyKey: randomUUID(), deviceId: input.device_id, email: input.email } });
}

/** Confirm a user token with Circle and reduce it to a stable identity. */
export async function verifyCircleUserToken(e: Engine, userToken: string): Promise<Web3AuthIdentity> {
  if (e.cfg.verifyCircleUserToken) return e.cfg.verifyCircleUserToken(userToken);
  const data = await circle<{ user?: { id?: string } }>(e, "GET", "/user", { userToken });
  const id = data.user?.id;
  if (!id || typeof id !== "string") throw new EngineError("INVALID_TOKEN", "The sign-in was rejected. Sign in again.", 401);
  const subject = `circle:${id.toLowerCase()}`;
  return { subject, aliases: [subject], email: null, name: null, emailVerified: false, connection: "circle", issuedAt: null };
}
