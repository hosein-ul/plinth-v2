/** Plinth contracts deployed and byte-verified on mainnet. Source of truth: deployments/arc-mainnet.json in the repository. */
export interface ContractSet { token: "USDC" | "EURC"; vaultFactory: string; invoiceFactory: string; invoiceImplementation: string; paymentRouter: string }

export const DEPLOYED: Record<string, { name: string; chainId: number; treasury: string; sets: ContractSet[] }> = {
  "arc-mainnet": {
    name: "Arc",
    chainId: 5042,
    treasury: "0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2",
    sets: [
      { token: "USDC", vaultFactory: "0x258591720519F42775693Ff7da0a41406387a625", invoiceFactory: "0x16091911885102D71A5aa3774AeD56Fb51e60538", invoiceImplementation: "0x79136c787DeE7e8583DaAD0f55683149c4BF184D", paymentRouter: "0x396081691Ea3CBEDAa5D8A26595081cC76a79312" },
      { token: "EURC", vaultFactory: "0xBcA006285F0Bec19AdD48333B6f5fd8bD2BDA8e9", invoiceFactory: "0x1D9eb25f4eb550250BB5631ED451bBDA862FCbBf", invoiceImplementation: "0x75b553Baf2c926C0E29e53e551437C85De4c08E1", paymentRouter: "0x2Aed78F76fD40a1BAf6F00BDEe30Ec0ABcb06A30" },
    ],
  },
};
