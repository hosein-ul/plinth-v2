import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData, erc20Abi, hexToString, keccak256, stringToHex, toEventSelector } from "viem";
import { NETWORKS } from "@plinth/shared";
import { memoAbi, memoIdFor, wrapWithMemo } from "../src";

describe("Arc memo wrapper", () => {
  it("uses the event signature Arc documents", () => {
    // topic0 published in Arc's transaction-memo tutorial for Memo(address,address,bytes32,bytes32,bytes,uint256)
    expect(toEventSelector("Memo(address,address,bytes32,bytes32,bytes,uint256)")).toBe("0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4");
  });

  it("wraps a token transfer and keeps the original call intact", () => {
    const net = NETWORKS["arc-mainnet"];
    const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x00000000000000000000000000000000000000a1", 5_000_000n] });
    const wrapped = wrapWithMemo(net.memoContract!, net.usdc.address, transfer, "wd_123");
    expect(wrapped.to).toBe(net.memoContract);
    const decoded = decodeFunctionData({ abi: memoAbi, data: wrapped.data });
    expect(decoded.functionName).toBe("memo");
    const [target, data, memoId, memoData] = decoded.args as [string, string, string, string];
    expect(target.toLowerCase()).toBe(net.usdc.address.toLowerCase());
    expect(data).toBe(transfer);
    expect(memoId).toBe(keccak256(stringToHex("wd_123")));
    expect(hexToString(memoData as `0x${string}`)).toBe("wd_123");
    expect(memoIdFor("wd_123")).toBe(memoId);
  });
});
