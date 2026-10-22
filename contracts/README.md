# Plinth contracts

Solidity 0.8.28 (EVM target `paris`), Foundry, OpenZeppelin 5. Five small contracts, no proxies, no admin role, no upgrade path.
How they fit the product: see the [root README](../README.md#smart-contracts). Deployed addresses: [`../deployments`](../deployments).

| File | Contract | Summary |
| --- | --- | --- |
| `src/MerchantVault.sol` | `MerchantVault` | One per merchant and chain. Only the owner can withdraw or change the settlement policy. Automatic forwarding policies take effect after a delay; "keep in vault" is instant |
| `src/VaultFactory.sol` | `VaultFactory` | Deploys vaults at deterministic addresses and is the registry of genuine vaults |
| `src/InvoiceDeposit.sol` | `InvoiceDeposit` | Implementation of every invoice deposit address (ERC-1167 clone, immutable args). `sweep()` takes no arguments and splits the balance into fee and destination |
| `src/InvoiceFactory.sol` | `InvoiceFactory` | `predict()` an address before it exists, `deployAndSweep()` and `deployAndSweepBatch()` |
| `src/PaymentRouter.sol` | `PaymentRouter` | Gasless wallet checkout with an EIP-3009 `receiveWithAuthorization` whose nonce commits to the payment |
| `src/lib/FeeSplit.sol` | library | Fee arithmetic and the fail-open fee transfer |
| `src/interfaces/IFiatToken.sol` | interface | The EIP-3009 surface of Circle's token |
| `script/Deploy.s.sol` | script | Deploys one set of four contracts for one token |

Each deployment is **one set per payment token** (USDC and EURC have separate sets). The fee is committed in each invoice address, capped by
`MAX_FEE_BPS` (100 bps) at deployment, and fails open: a failing treasury transfer never blocks a settlement.

## Build and test

```shell
forge build
forge test                              # unit, fuzz and invariant tests
forge test --match-path test/Invariants.t.sol
FOUNDRY_FUZZ_RUNS=20000 forge test      # the heavy campaign
```

Tests: `MerchantVault`, `InvoiceSweep`, `InvoiceFee`, `PaymentRouter`, `MultiToken`, `GasReport`, `Invariants` and a fork test (`Fork.t.sol`).
Arc has its own Foundry fork (`arc-forge`, `arc-anvil --network arc`) that models native USDC; the suite also passes under it (89 tests).

## Deploy

The registry in `packages/shared` must agree with the live token first (`pnpm verify:networks <network>` from the repository root).

```shell
DEPLOYER_PRIVATE_KEY=... TREASURY=0x... USDC_ADDRESS=0x... EXPECTED_CHAIN_ID=5042002 \
  forge script script/Deploy.s.sol --rpc-url <rpc> --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

| Variable | Meaning |
| --- | --- |
| `EXPECTED_CHAIN_ID` | The script refuses to run on any other chain |
| `TREASURY` | Fee recipient. Must be a plain account |
| `USDC_ADDRESS` / `TOKEN_ADDRESS` | The settlement token. It needs code and 6 decimals |
| `TOKEN_SYMBOL` | `USDC` (default) or `EURC`; selects the output file name |
| `MAX_FEE_BPS` | Fee cap, default 100 |
| `CONTRACT_VERSION` | Part of every deposit address; do not change it for a live network |
| `ALLOW_MAINNET_DEPLOY` | Required for any production chain id |

The script writes `../deployments/raw-<chainId>[-<TOKEN>].json`. Then, from the repository root, `pnpm finalize:deployment --network <id>` byte-compares the
on-chain code with the build artifacts, checks the wiring and the offline CREATE2 derivation, and writes the record the app reads.
A mainnet record needs `pnpm approve:deployment`.
