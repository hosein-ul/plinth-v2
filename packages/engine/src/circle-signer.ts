import { constants, publicEncrypt, randomUUID } from "node:crypto";
import { getAddress, hashMessage, hashTypedData, toHex, type Address, type Hex, type LocalAccount } from "viem";
import { toAccount } from "viem/accounts";
import type { SignerProvider } from "./bootstrap";

const CIRCLE_W3S_BASE = "https://api.circle.com/v1/w3s";

export interface CircleDeveloperSignerConfig {
  apiKey: string;
  entitySecret: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface CircleWalletDescriptor {
  walletId: string;
  address: Address;
}

/**
 * Encrypts a 32-byte hex-encoded Circle Entity Secret using Circle's RSA public key
 * (RSA-OAEP with SHA-256 for both OAEP hash and MGF1), returning a base64 ciphertext.
 * Circle requires a freshly encrypted ciphertext on every API request.
 */
export function encryptEntitySecret(entitySecretHex: string, publicKeyPem: string): string {
  const normalized = entitySecretHex.startsWith("0x") ? entitySecretHex.slice(2) : entitySecretHex;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("CIRCLE_ENTITY_SECRET must be a 32-byte (64-character) hex string");
  }
  const secretBytes = Buffer.from(normalized, "hex");
  const encrypted = publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    secretBytes,
  );
  return encrypted.toString("base64");
}

interface CircleApiEnvelope<T> {
  data?: T;
  code?: number;
  message?: string;
}

export class CircleDeveloperSignerClient {
  private readonly apiKey: string;
  private readonly entitySecret: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private cachedPublicKeyPem: string | null = null;

  constructor(cfg: CircleDeveloperSignerConfig) {
    if (!cfg.apiKey) throw new Error("CIRCLE_API_KEY is required for CircleDeveloperSignerClient");
    const normalized = cfg.entitySecret.startsWith("0x") ? cfg.entitySecret.slice(2) : cfg.entitySecret;
    if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new Error("CIRCLE_ENTITY_SECRET must be a 32-byte (64-character) hex string");
    }
    this.apiKey = cfg.apiKey;
    this.entitySecret = normalized;
    this.baseUrl = (cfg.baseUrl ?? CIRCLE_W3S_BASE).replace(/\/$/, "");
    this.fetchFn = cfg.fetchFn ?? fetch;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "x-request-id": randomUUID(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as CircleApiEnvelope<T>;
    if (!res.ok || !json.data) {
      throw new Error(`Circle W3S API error (${res.status}) on ${path}: ${json.message ?? "unexpected response"}`);
    }
    return json.data;
  }

  async getEntityPublicKey(forceRefresh = false): Promise<string> {
    if (this.cachedPublicKeyPem && !forceRefresh) return this.cachedPublicKeyPem;
    const data = await this.request<{ publicKey: string }>("GET", "/config/entity/publicKey");
    if (!data.publicKey || typeof data.publicKey !== "string") {
      throw new Error("Circle /config/entity/publicKey did not return a publicKey");
    }
    this.cachedPublicKeyPem = data.publicKey;
    return data.publicKey;
  }

  private async nextCiphertext(): Promise<string> {
    const pem = await this.getEntityPublicKey();
    return encryptEntitySecret(this.entitySecret, pem);
  }

  async signTransaction(walletId: string, tx: {
    to?: Address | null;
    nonce?: number;
    value?: bigint;
    chainId?: number;
    gas?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    data?: Hex;
  }): Promise<Hex> {
    const txPayload: Record<string, unknown> = {
      type: 2,
      chainId: Number(tx.chainId ?? 1),
      nonce: toHex(tx.nonce ?? 0),
      value: toHex(tx.value ?? 0n),
      gas: toHex(tx.gas ?? 21_000n),
      maxFeePerGas: toHex(tx.maxFeePerGas ?? 0n),
      maxPriorityFeePerGas: toHex(tx.maxPriorityFeePerGas ?? 0n),
      data: tx.data ?? "0x",
    };
    if (tx.to) txPayload.to = getAddress(tx.to);

    const entitySecretCiphertext = await this.nextCiphertext();
    const data = await this.request<{ signedTransaction?: string; signature?: string }>(
      "POST",
      "/developer/sign/transaction",
      {
        walletId,
        entitySecretCiphertext,
        transaction: JSON.stringify(txPayload),
      },
    );
    if (!data.signedTransaction || !data.signedTransaction.startsWith("0x")) {
      throw new Error("Circle /developer/sign/transaction did not return a hex signedTransaction");
    }
    return data.signedTransaction as Hex;
  }

  async signMessage(walletId: string, message: string | { raw: Hex | Uint8Array }): Promise<Hex> {
    const isRaw = typeof message !== "string";
    const encoded = isRaw
      ? typeof message.raw === "string"
        ? message.raw
        : toHex(message.raw)
      : message;
    const entitySecretCiphertext = await this.nextCiphertext();
    const data = await this.request<{ signature?: string }>("POST", "/developer/sign/message", {
      walletId,
      entitySecretCiphertext,
      message: encoded,
      encodedByHex: isRaw,
    });
    if (!data.signature || !data.signature.startsWith("0x")) {
      throw new Error("Circle /developer/sign/message did not return a hex signature");
    }
    return data.signature as Hex;
  }

  async signTypedData(walletId: string, typedData: unknown): Promise<Hex> {
    const entitySecretCiphertext = await this.nextCiphertext();
    const serialized = JSON.stringify(typedData, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    const data = await this.request<{ signature?: string }>("POST", "/developer/sign/typedData", {
      walletId,
      entitySecretCiphertext,
      data: serialized,
    });
    if (!data.signature || !data.signature.startsWith("0x")) {
      throw new Error("Circle /developer/sign/typedData did not return a hex signature");
    }
    return data.signature as Hex;
  }

  toLocalAccount(wallet: CircleWalletDescriptor): LocalAccount {
    const address = getAddress(wallet.address);
    return toAccount({
      address,
      signMessage: ({ message }) => this.signMessage(wallet.walletId, message),
      signTransaction: (tx) =>
        this.signTransaction(wallet.walletId, {
          to: tx.to,
          nonce: tx.nonce,
          value: tx.value,
          chainId: tx.chainId,
          gas: tx.gas,
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          data: tx.data,
        }),
      signTypedData: (typedData) => this.signTypedData(wallet.walletId, typedData),
      // Kept for type completeness; viem uses signTransaction / signMessage / signTypedData directly.
      ...(false ? { hashMessage, hashTypedData } : {}),
    });
  }
}

export function hasCircleDeveloperSignerEnv(env: Record<string, string | undefined> = process.env): boolean {
  if (!env.CIRCLE_API_KEY || !env.CIRCLE_ENTITY_SECRET) return false;
  return Boolean(
    env.CIRCLE_WALLET_ID || Object.keys(env).some((k) => k.startsWith("CIRCLE_WALLET_ID_")),
  );
}

/**
 * Creates a SignerProvider backed by Circle Developer-Controlled Wallets.
 *
 * Environment variables:
 * - CIRCLE_API_KEY
 * - CIRCLE_ENTITY_SECRET (64-char hex)
 * - CIRCLE_WALLET_ID / CIRCLE_WALLET_ID_<NETWORK>
 * - CIRCLE_WALLET_ADDRESS / CIRCLE_WALLET_ADDRESS_<NETWORK>
 * - Optional custody: CIRCLE_CUSTODY_WALLET_ID / CIRCLE_CUSTODY_WALLET_ID_<NETWORK>
 *   and CIRCLE_CUSTODY_WALLET_ADDRESS / CIRCLE_CUSTODY_WALLET_ADDRESS_<NETWORK>
 */
export function circleDeveloperSignerProvider(
  env: Record<string, string | undefined> = process.env,
  opts: { baseUrl?: string; fetchFn?: typeof fetch } = {},
): SignerProvider {
  const apiKey = env.CIRCLE_API_KEY;
  const entitySecret = env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required for circleDeveloperSignerProvider");
  }
  const client = new CircleDeveloperSignerClient({
    apiKey,
    entitySecret,
    baseUrl: opts.baseUrl ?? env.CIRCLE_W3S_BASE_URL,
    fetchFn: opts.fetchFn,
  });

  const resolveWallet = (prefix: string, networkId: string): LocalAccount | undefined => {
    const suffix = networkId.toUpperCase().replace(/-/g, "_");
    const walletId = env[`${prefix}_ID_${suffix}`] ?? env[`${prefix}_ID`];
    const walletAddress = env[`${prefix}_ADDRESS_${suffix}`] ?? env[`${prefix}_ADDRESS`];
    if (!walletId || !walletAddress) return undefined;
    return client.toLocalAccount({ walletId, address: getAddress(walletAddress) });
  };

  return {
    getSigner: (networkId) => resolveWallet("CIRCLE_WALLET", networkId),
    getCustodySigner: (networkId) => resolveWallet("CIRCLE_CUSTODY_WALLET", networkId),
  };
}
