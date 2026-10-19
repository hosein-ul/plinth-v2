import { describe, expect, it } from "vitest";
import { encodeAbiParameters, getAddress, pad, type Address, type Hex, type PublicClient } from "viem";
import { NETWORKS } from "@plinth/shared";
import { EvmAdapter } from "../src";

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;
const net = NETWORKS["arc-mainnet"];
const USDC = net.usdc.address;
const SYSTEM = net.nativeTransferEmitter!;
const invoice = getAddress("0x00000000000000000000000000000000000000a1");
const payer = getAddress("0x00000000000000000000000000000000000000b2");
const blockHash = `0x${"11".repeat(32)}` as Hex;

const topic = (a: Address) => pad(a, { size: 32 }).toLowerCase() as Hex;
const data = (v: bigint) => encodeAbiParameters([{ type: "uint256" }], [v]);
const MICRO = 10n ** 12n;

function log(address: Address, from: Address, to: Address, value: bigint, tx: Hex, logIndex: number) {
  return { address, topics: [TRANSFER, topic(from), topic(to)], data: data(value), blockNumber: 10n, logIndex, transactionHash: tx, blockHash };
}
const txA = `0x${"aa".repeat(32)}` as Hex;
const txB = `0x${"bb".repeat(32)}` as Hex;

function adapterWith(logs: ReturnType<typeof log>[]) {
  const client = {
    getLogs: async () => logs,
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: "success", blockNumber: 10n, blockHash, logs: logs.filter((l) => l.transactionHash === hash) }),
    getBlock: async () => ({ hash: blockHash, timestamp: 1_700_000_000n, number: 10n }),
  } as unknown as PublicClient;
  const a = Object.create(EvmAdapter.prototype) as EvmAdapter;
  Object.assign(a, { network: net, symbol: "USDC", token: { address: USDC }, client });
  return a;
}

describe("Arc native USDC transfers (EIP-7708 system logs)", () => {
  it("an ERC-20 transfer emits two logs but is counted once", async () => {
    const a = adapterWith([log(SYSTEM, payer, invoice, 25_000_000n * MICRO, txA, 0), log(USDC, payer, invoice, 25_000_000n, txA, 1)]);
    const seen = await a.scanTransfers(1n, 20n, [invoice]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ token: USDC, value: 25_000_000n, logIndex: 1 });
  });

  it("a plain native send (system log only) is a USDC deposit in 6-decimal units", async () => {
    const a = adapterWith([log(SYSTEM, payer, invoice, 7_500_000n * MICRO + 123n, txB, 0)]);
    const seen = await a.scanTransfers(1n, 20n, [invoice]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ token: USDC, value: 7_500_000n, logIndex: 0 });
    const v = await a.verifyTransfer(txB, 0, invoice);
    expect(v).toMatchObject({ ok: true, official: true });
    if (v.ok) expect(v.transfer).toMatchObject({ token: USDC, value: 7_500_000n });
  });

  it("an ERC-20 transfer plus a separate native send of the same amount in one transaction are two deposits", async () => {
    const a = adapterWith([
      log(SYSTEM, payer, invoice, 5_000_000n * MICRO, txA, 0), // the ERC-20 transfer's system log
      log(USDC, payer, invoice, 5_000_000n, txA, 1),
      log(SYSTEM, payer, invoice, 5_000_000n * MICRO, txA, 2), // a native send of the same amount
    ]);
    const seen = await a.scanTransfers(1n, 20n, [invoice]);
    expect(seen.map((s) => s.logIndex)).toEqual([1, 2]);
  });

  it("dust below one token unit is not a payment", async () => {
    const a = adapterWith([log(SYSTEM, payer, invoice, MICRO - 1n, txB, 0)]);
    expect(await a.scanTransfers(1n, 20n, [invoice])).toHaveLength(0);
    expect(await a.verifyTransfer(txB, 0, invoice)).toMatchObject({ ok: false });
  });

  it("another token still shows up as another token", async () => {
    const other = getAddress("0x00000000000000000000000000000000000000c3");
    const a = adapterWith([log(other, payer, invoice, 9n, txB, 0)]);
    const seen = await a.scanTransfers(1n, 20n, [invoice]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.token).toBe(other);
  });
});
