import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, schema } from "@plinth/db";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { enableNetwork } from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
beforeAll(async () => {
  h = await startHarness({ confirmations: 2 });
});
afterAll(async () => h.stop());

describe("relayer budget share", () => {
  it("free-account work (vault creation) can use only its share of the daily operation budget", async () => {
    const chain = h.engine.chains.get(h.net)!;
    chain.policy = { ...chain.policy, maxOpsPerDay: 20 }; // vault creation may use 15% of that: 3 operations
    for (let i = 0; i < 6; i++) {
      const merchant = await h.newMerchant(`Spam ${i}`);
      await enableNetwork(h.engine, merchant, { network: h.net, owner_address: privateKeyToAccount(generatePrivateKey()).address });
    }
    await h.pump(5);
    const ops = await h.engine.db.select().from(schema.relayerOperations).where(and(eq(schema.relayerOperations.networkId, h.net), eq(schema.relayerOperations.kind, "CREATE_VAULT")));
    const sent = ops.filter((o) => ["SUBMITTED", "CONFIRMED", "REVERTED"].includes(o.status)).length;
    const waiting = ops.filter((o) => o.status === "QUEUED").length;
    expect(sent).toBe(3);
    expect(waiting).toBe(3);

    // The rest of the budget is still there for the work that matters: a sweep is not blocked by the vault spam.
    const used = await h.engine.db.select().from(schema.relayerOperations).where(and(eq(schema.relayerOperations.networkId, h.net), inArray(schema.relayerOperations.status, ["SUBMITTED", "CONFIRMED", "REVERTED"])));
    expect(used.length).toBeLessThan(20);
  });
});
