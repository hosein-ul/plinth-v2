import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, schema } from "@plinth/db";
import { circleRequestOtp, signInWithIdentity, verifyCircleUserToken } from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => h.stop());
afterEach(() => {
  vi.unstubAllGlobals();
  delete h.engine.cfg.circleApiKey;
});

const actor = { type: "USER" as const, ip: "127.0.0.1" };
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("Circle Wallets sign-in", () => {
  it("refuses when no API key is configured", async () => {
    await expect(verifyCircleUserToken(h.engine, "t".repeat(30))).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("asks Circle to send the code, with the key in a header and never in the body", async () => {
    h.engine.cfg.circleApiKey = "TEST_KEY:abc";
    const f = reply(200, { data: { deviceToken: "dt", deviceEncryptionKey: "dek", otpToken: "ot" } });
    vi.stubGlobal("fetch", f);
    const out = await circleRequestOtp(h.engine, { device_id: "device-12345", email: "a@b.co" });
    expect(out).toEqual({ deviceToken: "dt", deviceEncryptionKey: "dek", otpToken: "ot" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.circle.com/v1/w3s/users/email/token");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer TEST_KEY:abc");
    expect(String(init.body)).not.toContain("TEST_KEY");
  });

  it("turns a user token confirmed by Circle into a stable identity, and rejects a refused one", async () => {
    h.engine.cfg.circleApiKey = "TEST_KEY:abc";
    vi.stubGlobal("fetch", reply(200, { data: { user: { id: "USER-ID-1" } } }));
    expect(await verifyCircleUserToken(h.engine, "t".repeat(30))).toMatchObject({ subject: "circle:user-id-1", connection: "circle" });
    vi.stubGlobal("fetch", reply(401, { code: 155104, message: "invalid user token" }));
    await expect(verifyCircleUserToken(h.engine, "t".repeat(30))).rejects.toMatchObject({ code: "INVALID_TOKEN", status: 401 });
  });

  it("creates one merchant on first sign-in and finds the same one next time, under its own provider", async () => {
    const id = { subject: "circle:user-xyz", aliases: ["circle:user-xyz"], email: null, name: null, emailVerified: false, connection: "circle", issuedAt: null };
    const a = await signInWithIdentity(h.engine, id, { business_name: "Circle Cafe" }, actor);
    const b = await signInWithIdentity(h.engine, id, {}, actor);
    expect(a.user.id).toBe(b.user.id);
    const rows = await h.handle.db.select().from(schema.externalIdentities).where(eq(schema.externalIdentities.subject, "circle:user-xyz"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe("circle");
  });
});
