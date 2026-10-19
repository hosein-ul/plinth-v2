import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, schema } from "@plinth/db";
import { MerchantVaultAbi } from "@plinth/blockchain";
import { parseUsdc } from "@plinth/shared";
import { encodeFunctionData, getAddress } from "viem";
import { enableNetwork, forwardTick, type AuthContext } from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let m: AuthContext;
let vault: `0x${string}`;
const payee = () => h.chain.accounts[5]!.address;

const forwardOps = async () =>
  (await h.engine.db.select().from(schema.relayerOperations).where(and(eq(schema.relayerOperations.networkId, h.net), eq(schema.relayerOperations.kind, "FORWARD")))).length;

beforeAll(async () => {
  h = await startHarness({ confirmations: 2 });
  m = await h.newMerchant("Forwarder");
  await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address });
  await h.pump(2);
  const [v] = await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId));
  vault = getAddress(v!.vaultAddress);

  // The owner switches the vault to INSTANT_FORWARD; the change waits out the vault's configuration delay, then the relayer activates it.
  const hash = await h.chain.walletFor(2).sendTransaction({
    to: vault, account: h.chain.accounts[2]!, chain: undefined,
    data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "scheduleSettlement", args: [{ mode: 1, destination: payee(), threshold: 0n, interval: 0n }] }),
  });
  await h.chain.publicClient.waitForTransactionReceipt({ hash });
  const block = await h.chain.publicClient.getBlock();
  await h.chain.setTime(Number(block.timestamp) + 90_000);
  await h.chain.mine(1);
  for (let i = 0; i < 4; i++) {
    await forwardTick(h.engine, h.net);
    await h.pump(1);
  }
}, 120_000);
afterAll(async () => h.stop());

describe("vault forwarding", () => {
  it("does not spend relayer transactions on dust", async () => {
    await h.payUsdc(vault, parseUsdc("0.005")); // below the network's dust floor
    const before = await forwardOps();
    for (let i = 0; i < 3; i++) {
      await h.chain.mine(1);
      await forwardTick(h.engine, h.net);
    }
    expect(await forwardOps()).toBe(before);
  });

  it("queues ONE forward per vault however many blocks pass before it is sent, then forwards the balance", async () => {
    await h.payUsdc(vault, parseUsdc("40"));
    const before = await forwardOps();
    for (let i = 0; i < 5; i++) {
      await h.chain.mine(1); // a new block every pass used to produce a new operation every pass
      await forwardTick(h.engine, h.net);
    }
    expect(await forwardOps()).toBe(before + 1);
    await h.pump(4);
    const [stats] = await h.engine.db.select().from(schema.relayerOperations).where(and(eq(schema.relayerOperations.kind, "FORWARD"), eq(schema.relayerOperations.status, "CONFIRMED")));
    expect(stats).toBeTruthy();
    const received = await h.chain.publicClient.readContract({ address: h.chain.usdc, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const, functionName: "balanceOf", args: [payee()] });
    expect(received).toBeGreaterThanOrEqual(parseUsdc("40"));
  });
});
