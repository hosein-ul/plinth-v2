/** Plinth contracts deployed and byte-verified on mainnet. Source of truth: deployments/arc-mainnet.json in the repository. */
export interface ContractSet { token: "USDC" | "EURC"; vaultFactory: string; invoiceFactory: string; invoiceImplementation: string; paymentRouter: string }

export const DEPLOYED: Record<string, { name: string; chainId: number; treasury: string; sets: ContractSet[] }> = {
  "arc-mainnet": {
    name: "Arc",
    chainId: 5042,
    treasury: "0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2",
    sets: [
      { token: "USDC", vaultFactory: "0xeBc902Cee74345DD23f63E2f132f81E5fBE1D56D", invoiceFactory: "0xb10655458F990335b6339d0c95D9755B5CACa168", invoiceImplementation: "0x795090A656f472cdddeF8cF367A4ee446b39ea84", paymentRouter: "0xf154b3Da58EEa004d5B05a90fF5BA595F8A40728" },
      { token: "EURC", vaultFactory: "0x0A310C2cC7c445D33fe91586240992b6f432B2ea", invoiceFactory: "0xc8a620C0dD6370DeB0254848D3877160f057ad65", invoiceImplementation: "0x8e3326B7638b388717B821aA225a5E2c19477a9f", paymentRouter: "0x134C791F1aFC4f51D19d698Fae981D6663905Dfb" },
    ],
  },
};
