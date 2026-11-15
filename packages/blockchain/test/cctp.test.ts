import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { NETWORKS } from "@plinth/shared";
import {
  CCTP_FINALITY_STANDARD,
  MESSAGE_TRANSMITTER_V2_ABI,
  TOKEN_MESSENGER_V2_ABI,
  addressToBytes32,
  encodeCctpBurnCalldata,
  encodeCctpReceiveCalldata,
  fetchCctpV2Attestation,
  irisApiBaseUrl,
} from "../src";

describe("CCTP V2 integration (@plinth/blockchain)", () => {
  test("addressToBytes32 left-pads 20-byte EVM address to 32 bytes", () => {
    const padded = addressToBytes32("0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2");
    expect(padded.toLowerCase()).toBe("0x000000000000000000000000c0d1ac70a3a32bcea4a124e65eb22eb5f0d0adc2");
  });

  test("irisApiBaseUrl maps mainnet and testnet to official Circle Iris endpoints", () => {
    expect(irisApiBaseUrl("mainnet")).toBe("https://iris-api.circle.com");
    expect(irisApiBaseUrl("testnet")).toBe("https://iris-api-sandbox.circle.com");
  });

  test("encodeCctpBurnCalldata encodes depositForBurn for Base Sepolia -> Arc Testnet (domain 26)", () => {
    const call = encodeCctpBurnCalldata({
      sourceNetwork: NETWORKS["base-sepolia"],
      destinationNetwork: NETWORKS["arc-testnet"],
      amount: 5_000_000n,
      mintRecipient: "0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2",
    });

    expect(call.to).toBe("0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA");
    const decoded = decodeFunctionData({ abi: TOKEN_MESSENGER_V2_ABI, data: call.data });
    expect(decoded.functionName).toBe("depositForBurn");
    expect(decoded.args[0]).toBe(5_000_000n);
    expect(decoded.args[1]).toBe(26);
    expect(decoded.args[2]).toBe("0x000000000000000000000000c0d1ac70a3a32bcea4a124e65eb22eb5f0d0adc2");
    expect(decoded.args[3]).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(decoded.args[6]).toBe(CCTP_FINALITY_STANDARD);
  });

  test("encodeCctpReceiveCalldata encodes receiveMessage for Arc Mainnet MessageTransmitterV2", () => {
    const call = encodeCctpReceiveCalldata(NETWORKS["arc-mainnet"], "0xabcd", "0x1234");
    expect(call.to).toBe("0x81D40F21F12A8F0E3252Bccb954D722d4c464B64");
    const decoded = decodeFunctionData({ abi: MESSAGE_TRANSMITTER_V2_ABI, data: call.data });
    expect(decoded.functionName).toBe("receiveMessage");
    expect(decoded.args).toEqual(["0xabcd", "0x1234"]);
  });

  test("fetchCctpV2Attestation handles pending and complete Iris V2 responses", async () => {
    const txHash = ("0x" + "aa".repeat(32)) as `0x${string}`;

    const pendingRes = await fetchCctpV2Attestation({
      sourceDomain: 26,
      transactionHash: txHash,
      environment: "testnet",
      fetchFn: async (input) => {
        expect(input.toString()).toBe(`https://iris-api-sandbox.circle.com/v2/messages/26?transactionHash=${txHash}`);
        return new Response(
          JSON.stringify({
            messages: [{ message: "0x11", attestation: "PENDING", eventNonce: "0x01", cctpVersion: 2, status: "pending_confirmations" }],
          }),
          { status: 200 },
        );
      },
    });
    expect(pendingRes.ready).toBe(false);

    const completeRes = await fetchCctpV2Attestation({
      sourceDomain: 26,
      transactionHash: txHash,
      environment: "mainnet",
      fetchFn: async (input) => {
        expect(input.toString()).toBe(`https://iris-api.circle.com/v2/messages/26?transactionHash=${txHash}`);
        return new Response(
          JSON.stringify({
            messages: [{ message: "0x1122", attestation: "0x3344", eventNonce: "0x02", cctpVersion: 2, status: "complete" }],
          }),
          { status: 200 },
        );
      },
    });
    expect(completeRes.ready).toBe(true);
    expect(completeRes.messages[0]!.attestation).toBe("0x3344");
  });
});
