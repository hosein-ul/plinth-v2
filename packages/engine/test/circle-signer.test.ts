import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { describe, expect, test } from "vitest";
import { circleDeveloperSignerProvider, encryptEntitySecret, hasCircleDeveloperSignerEnv } from "../src";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const SAMPLE_SECRET = "ab".repeat(32);

describe("circle-signer (Circle Developer-Controlled Wallets)", () => {
  test("encryptEntitySecret encrypts 32-byte hex secret with RSA-OAEP SHA-256 and produces unique ciphertexts", () => {
    const c1 = encryptEntitySecret(SAMPLE_SECRET, publicKey);
    const c2 = encryptEntitySecret(`0x${SAMPLE_SECRET}`, publicKey);
    expect(c1).not.toBe(c2);

    const dec1 = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(c1, "base64"),
    ).toString("hex");
    expect(dec1).toBe(SAMPLE_SECRET);
  });

  test("rejects malformed entity secrets", () => {
    expect(() => encryptEntitySecret("too-short", publicKey)).toThrow(/32-byte/);
  });

  test("hasCircleDeveloperSignerEnv detects Circle wallet configuration", () => {
    expect(hasCircleDeveloperSignerEnv({})).toBe(false);
    expect(hasCircleDeveloperSignerEnv({ CIRCLE_API_KEY: "k", CIRCLE_ENTITY_SECRET: SAMPLE_SECRET })).toBe(false);
    expect(
      hasCircleDeveloperSignerEnv({
        CIRCLE_API_KEY: "k",
        CIRCLE_ENTITY_SECRET: SAMPLE_SECRET,
        CIRCLE_WALLET_ID_ARC_TESTNET: "w-1",
      }),
    ).toBe(true);
  });

  test("circleDeveloperSignerProvider fetches entity public key once and signs EIP-1559 transactions via Circle W3S API", async () => {
    const calls: { url: string; method: string; body?: Record<string, unknown>; requestId?: string | null }[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
      calls.push({ url, method, body, requestId: new Headers(init?.headers).get("x-request-id") });

      if (url.endsWith("/config/entity/publicKey")) {
        return new Response(JSON.stringify({ data: { publicKey } }), { status: 200 });
      }
      if (url.endsWith("/developer/sign/transaction")) {
        return new Response(
          JSON.stringify({
            data: {
              signature: "0xdeadbeef",
              signedTransaction: "0x02f86b8213b2018459682f008459682f008252089411111111111111111111111111111111111111118080c001a0",
              txHash: "0x" + "11".repeat(32),
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: 404, message: "not found" }), { status: 404 });
    };

    const provider = circleDeveloperSignerProvider(
      {
        CIRCLE_API_KEY: "TEST_API_KEY:id:secret",
        CIRCLE_ENTITY_SECRET: SAMPLE_SECRET,
        CIRCLE_WALLET_ID_ARC_TESTNET: "wallet-uuid-arc-testnet",
        CIRCLE_WALLET_ADDRESS_ARC_TESTNET: "0x1111111111111111111111111111111111111111",
        CIRCLE_CUSTODY_WALLET_ID_ARC_TESTNET: "custody-uuid-arc-testnet",
        CIRCLE_CUSTODY_WALLET_ADDRESS_ARC_TESTNET: "0x2222222222222222222222222222222222222222",
      },
      { fetchFn: mockFetch },
    );

    const signer = provider.getSigner("arc-testnet");
    const custody = provider.getCustodySigner?.("arc-testnet");
    expect(signer?.address).toBe("0x1111111111111111111111111111111111111111");
    expect(custody?.address).toBe("0x2222222222222222222222222222222222222222");
    expect(provider.getSigner("base-sepolia")).toBeUndefined();

    const signed1 = await signer!.signTransaction({
      type: "eip1559",
      chainId: 5042002,
      nonce: 7,
      to: "0x761428302C7fD463D42338a7284a43026793855f",
      data: "0x1234",
      gas: 200_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      value: 0n,
    });
    const signed2 = await signer!.signTransaction({
      type: "eip1559",
      chainId: 5042002,
      nonce: 8,
      to: "0x761428302C7fD463D42338a7284a43026793855f",
      data: "0x1234",
      gas: 200_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      value: 0n,
    });

    expect(signed1).toMatch(/^0x02/);
    expect(signed2).toMatch(/^0x02/);
    // Public key fetched once and cached; two sign calls made
    expect(calls.filter((c) => c.url.endsWith("/config/entity/publicKey"))).toHaveLength(1);
    const signCalls = calls.filter((c) => c.url.endsWith("/developer/sign/transaction"));
    expect(signCalls).toHaveLength(2);
    expect(signCalls[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(signCalls[0]!.body!.walletId).toBe("wallet-uuid-arc-testnet");
    expect(signCalls[0]!.body!.entitySecretCiphertext).not.toBe(signCalls[1]!.body!.entitySecretCiphertext);

    const parsedTx = JSON.parse(signCalls[0]!.body!.transaction as string) as Record<string, unknown>;
    expect(parsedTx).toEqual({
      type: 2,
      chainId: 5042002,
      nonce: "0x7",
      value: "0x0",
      gas: "0x30d40",
      maxFeePerGas: "0x4a817c800",
      maxPriorityFeePerGas: "0x3b9aca00",
      data: "0x1234",
      to: "0x761428302C7fD463D42338a7284a43026793855f",
    });

    // Verify ciphertext decrypts back to SAMPLE_SECRET
    const decrypted = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(signCalls[0]!.body!.entitySecretCiphertext as string, "base64"),
    ).toString("hex");
    expect(decrypted).toBe(SAMPLE_SECRET);
  });
});
