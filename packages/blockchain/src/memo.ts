import { encodeFunctionData, keccak256, stringToHex, type Address, type Hex } from "viem";

/**
 * Arc's Memo contract forwards one call to a target while the caller stays the sender (it goes through the CallFrom precompile),
 * and logs a memo id and free-form bytes. Only an externally owned account can use it; a contract caller is rejected.
 */
export const memoAbi = [
  { type: "function", name: "memo", stateMutability: "nonpayable", inputs: [{ name: "target", type: "address" }, { name: "data", type: "bytes" }, { name: "memoId", type: "bytes32" }, { name: "memoData", type: "bytes" }], outputs: [] },
  { type: "event", name: "BeforeMemo", inputs: [{ name: "memoIndex", type: "uint256", indexed: true }] },
  {
    type: "event",
    name: "Memo",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "callDataHash", type: "bytes32", indexed: false },
      { name: "memoId", type: "bytes32", indexed: true },
      { name: "memo", type: "bytes", indexed: false },
      { name: "memoIndex", type: "uint256", indexed: false },
    ],
  },
] as const;

/** The 32-byte id a reference (a withdrawal, an invoice) is looked up by: keccak256 of its text. */
export function memoIdFor(reference: string): Hex {
  return keccak256(stringToHex(reference));
}

/** Transaction fields for sending `data` to `target` through the Memo contract. */
export function wrapWithMemo(memoContract: Address, target: Address, data: Hex, reference: string): { to: Address; data: Hex } {
  return {
    to: memoContract,
    data: encodeFunctionData({ abi: memoAbi, functionName: "memo", args: [target, data, memoIdFor(reference), stringToHex(reference)] }),
  };
}
