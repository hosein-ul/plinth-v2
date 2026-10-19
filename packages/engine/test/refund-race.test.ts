import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseUsdc } from "@plinth/shared";
import { createPaymentIntent, enableNetwork, getPaymentIntent, requestRefund, type AuthContext } from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let m: AuthContext;
const recipient = "0x000000000000000000000000000000000000dEaD";

beforeAll(async () => {
  h = await startHarness({ confirmations: 2 });
  m = await h.newMerchant("Refund race");
  await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address });
  await h.pump(2);
}, 60_000);
afterAll(async () => h.stop());

describe("refund requests", () => {
  it("two requests that each fit but together do not: only one is accepted", async () => {
    const pi = await createPaymentIntent(h.engine, m, { amount: "10.00", currency: "USDC", checkout_methods: ["ADDRESS"], expires_in_seconds: 3600 } as never);
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("10"));
    await h.pump(8);
    expect((await getPaymentIntent(h.engine, m, pi.id)).status).toBe("SETTLED");

    const asks = [0, 1].map(() => requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "6.00", recipient }));
    const results = await Promise.allSettled(asks);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "REFUND_EXCEEDS_PAYMENT" });
  });
});
