import { encodeFunctionData, getAddress, pad, parseAbi, zeroHash, type Address, type Hex } from "viem";
import type { NetworkConfig } from "@plinth/shared";

export const CCTP_FINALITY_STANDARD = 2000;

export const TOKEN_MESSENGER_V2_ABI = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
]);

export const MESSAGE_TRANSMITTER_V2_ABI = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool success)",
  "function usedNonces(bytes32 nonce) view returns (uint256)",
]);

export function irisApiBaseUrl(environment: "mainnet" | "testnet"): string {
  return environment === "mainnet" ? "https://iris-api.circle.com" : "https://iris-api-sandbox.circle.com";
}

/** Left-pads a 20-byte EVM address to a 32-byte CCTP identifier. */
export function addressToBytes32(address: Address): Hex {
  return pad(getAddress(address), { size: 32 });
}

export interface CctpBurnParams {
  sourceNetwork: NetworkConfig;
  destinationNetwork: NetworkConfig;
  amount: bigint;
  mintRecipient: Address;
  burnToken?: Address;
  destinationCaller?: Address;
  maxFee?: bigint;
  minFinalityThreshold?: number;
}

export interface EncodedContractCall {
  to: Address;
  data: Hex;
}

/**
 * Encodes a CCTP V2 TokenMessengerV2.depositForBurn call.
 * Defaults minFinalityThreshold to 2000 (finalized), which is required on Arc.
 */
export function encodeCctpBurnCalldata(params: CctpBurnParams): EncodedContractCall {
  const messenger = params.sourceNetwork.circle.cctpContracts?.tokenMessengerV2;
  if (!messenger) {
    throw new Error(`Network ${params.sourceNetwork.id} has no CCTP V2 TokenMessengerV2 configured`);
  }
  const destinationDomain = params.destinationNetwork.circle.cctpDomain;
  if (destinationDomain === null || destinationDomain === undefined) {
    throw new Error(`Destination network ${params.destinationNetwork.id} has no CCTP domain`);
  }
  if (params.amount <= 0n) {
    throw new Error("CCTP burn amount must be positive");
  }
  const burnToken = getAddress(params.burnToken ?? params.sourceNetwork.usdc.address);
  const destinationCaller = params.destinationCaller ? addressToBytes32(params.destinationCaller) : zeroHash;
  const maxFee = params.maxFee ?? 0n;
  const minFinalityThreshold = params.minFinalityThreshold ?? CCTP_FINALITY_STANDARD;

  return {
    to: getAddress(messenger),
    data: encodeFunctionData({
      abi: TOKEN_MESSENGER_V2_ABI,
      functionName: "depositForBurn",
      args: [
        params.amount,
        destinationDomain,
        addressToBytes32(params.mintRecipient),
        burnToken,
        destinationCaller,
        maxFee,
        minFinalityThreshold,
      ],
    }),
  };
}

/**
 * Encodes a CCTP V2 MessageTransmitterV2.receiveMessage call for minting on the destination chain.
 */
export function encodeCctpReceiveCalldata(
  destinationNetwork: NetworkConfig,
  message: Hex,
  attestation: Hex,
): EncodedContractCall {
  const transmitter = destinationNetwork.circle.cctpContracts?.messageTransmitterV2;
  if (!transmitter) {
    throw new Error(`Network ${destinationNetwork.id} has no CCTP V2 MessageTransmitterV2 configured`);
  }
  return {
    to: getAddress(transmitter),
    data: encodeFunctionData({
      abi: MESSAGE_TRANSMITTER_V2_ABI,
      functionName: "receiveMessage",
      args: [message, attestation],
    }),
  };
}

export interface CctpV2MessageRecord {
  message: Hex;
  attestation: Hex | "PENDING";
  eventNonce: string;
  cctpVersion: number;
  status: "complete" | "pending_confirmations" | string;
}

export interface CctpV2AttestationResult {
  ready: boolean;
  messages: CctpV2MessageRecord[];
}

/**
 * Queries Circle's Iris V2 attestation API for a CCTP burn transaction.
 * Endpoint: GET /v2/messages/{sourceDomain}?transactionHash={txHash}
 */
export async function fetchCctpV2Attestation(params: {
  sourceDomain: number;
  transactionHash: Hex;
  environment: "mainnet" | "testnet";
  baseUrl?: string;
  fetchFn?: typeof fetch;
}): Promise<CctpV2AttestationResult> {
  const base = (params.baseUrl ?? irisApiBaseUrl(params.environment)).replace(/\/$/, "");
  const url = `${base}/v2/messages/${params.sourceDomain}?transactionHash=${params.transactionHash}`;
  const fetchFn = params.fetchFn ?? fetch;

  const res = await fetchFn(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) {
    return { ready: false, messages: [] };
  }
  const json = (await res.json().catch(() => ({}))) as { messages?: CctpV2MessageRecord[]; error?: string };
  if (!res.ok) {
    throw new Error(`Circle Iris V2 API error (${res.status}): ${json.error ?? "unexpected response"}`);
  }
  const messages = Array.isArray(json.messages) ? json.messages : [];
  const ready =
    messages.length > 0 &&
    messages.every((m) => m.status === "complete" && typeof m.attestation === "string" && m.attestation.startsWith("0x"));
  return { ready, messages };
}
