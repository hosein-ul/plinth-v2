# Networks and tokens

The registry lives in `packages/shared/src/networks.ts`. Every entry is a **fact sheet**, not a switch: a network accepts payments only when it is
operational (see [architecture.md](architecture.md) section 6): listed in `ENABLED_NETWORKS`, its token probed, a byte-verified deployment record
present, and for mainnets `ALLOW_MAINNET=true` plus a human approval (`pnpm approve:deployment`). **No mainnet has contracts deployed today**, so every
mainnet below is closed.

## Registry (26 networks)

| Network | id | Chain id | Env | Tokens | Native | Finality | Log window | Relayer tier | Token probe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arc Testnet | `arc-testnet` | 5042002 | testnet | USDC, EURC | USDC | 1 conf. | 2000 | testnet | 2026-10-09 |
| Base Sepolia | `base-sepolia` | 84532 | testnet | USDC | ETH | 12 conf. | 5000 | testnet | 2026-10-09 |
| Arc | `arc-mainnet` | 5042 | mainnet | USDC, EURC | USDC | 1 conf. | 2000 | arc | 2026-10-09 |
| Base | `base-mainnet` | 8453 | mainnet | USDC | ETH | 20 conf. | 5000 | l2 | 2026-10-09 |
| Arbitrum One | `arbitrum-mainnet` | 42161 | mainnet | USDC | ETH | 20 conf. | 10000 | l2 | 2026-10-09 |
| OP Mainnet | `optimism-mainnet` | 10 | mainnet | USDC | ETH | 20 conf. | 5000 | l2 | 2026-10-09 |
| Polygon PoS | `polygon-mainnet` | 137 | mainnet | USDC | POL | 128 conf. | 3000 | polygon | not verified |
| Ethereum | `ethereum-mainnet` | 1 | mainnet | USDC | ETH | finalized tag | 5000 | ethereum | 2026-10-09 |
| Avalanche C-Chain | `avalanche-mainnet` | 43114 | mainnet | USDC | AVAX | finalized tag | 1000 | explicit | 2026-10-15 |
| Celo | `celo-mainnet` | 42220 | mainnet | USDC | CELO | finalized tag | 1000 | explicit | 2026-10-15 |
| Codex | `codex-mainnet` | 81224 | mainnet | USDC | native | finalized tag | 1000 | explicit | 2026-10-15 |
| Cronos | `cronos-mainnet` | 25 | mainnet | USDC | CRO | 20 conf. | 1000 | explicit | 2026-10-15 |
| HyperEVM | `hyperevm-mainnet` | 999 | mainnet | USDC | HYPE | 20 conf. | 500 | explicit | 2026-10-15 |
| Injective | `injective-mainnet` | 1776 | mainnet | USDC | INJ | 20 conf. | 1000 | explicit | 2026-10-15 |
| Ink | `ink-mainnet` | 57073 | mainnet | USDC | ETH | finalized tag | 1000 | l2 | 2026-10-15 |
| Linea | `linea-mainnet` | 59144 | mainnet | USDC | ETH | finalized tag | 1000 | l2 | 2026-10-15 |
| Monad | `monad-mainnet` | 143 | mainnet | USDC | MON | finalized tag | 100 | explicit | 2026-10-15 |
| Morph | `morph-mainnet` | 2818 | mainnet | USDC | ETH | finalized tag | 1000 | l2 | 2026-10-15 |
| Plasma | `plasma-mainnet` | 9745 | mainnet | USDC | XPL | finalized tag | 1000 | explicit | 2026-10-15 |
| Plume | `plume-mainnet` | 98866 | mainnet | USDC | PLUME | finalized tag | 1000 | explicit | 2026-10-15 |
| Sei | `sei-mainnet` | 1329 | mainnet | USDC | SEI | 20 conf. | 1000 | explicit | 2026-10-15 |
| Sonic | `sonic-mainnet` | 146 | mainnet | USDC | S | finalized tag | 1000 | explicit | 2026-10-15 |
| Unichain | `unichain-mainnet` | 130 | mainnet | USDC | ETH | finalized tag | 1000 | l2 | 2026-10-15 |
| World Chain | `worldchain-mainnet` | 480 | mainnet | USDC | ETH | finalized tag | 100 | l2 | 2026-10-15 |
| X Layer | `xlayer-mainnet` | 196 | mainnet | USDC | OKB | finalized tag | 100 | explicit | 2026-10-15 |
| XDC | `xdc-mainnet` | 50 | mainnet | USDC | XDC | finalized tag | 1000 | explicit | 2026-10-15 |

*Log window* is the largest `eth_getLogs` range the public RPC answered when measured (the watcher never asks for more). *Relayer tier* is the spending-limit
tier (`testnet`, `l2`, `ethereum`, `polygon`, `arc`, `explicit`).

## How each fact was obtained

* **USDC addresses** come from Circle's published list (developers.circle.com/stablecoins/usdc-contract-addresses). EURC addresses come from Arc's contract reference (docs.arc.io/arc/references/contract-addresses).
* **Probe (read-only, `pnpm verify:networks`)**: the RPC answers the expected chain id; the address has code; `symbol`, `decimals` and `version` match; the EIP-712 domain
  (name, version, chain id, address) reproduces the token's real `DOMAIN_SEPARATOR`; `receiveWithAuthorization`, `transferWithAuthorization` and `permit` exist (probed with an
  expired authorization, which reverts with a FiatToken reason; an absent selector would not); `receiveWithAuthorization` enforces "caller must be the payee" (why the router exists); and a
  log window of the recorded size is answered. Nothing is sent.
* **Finality** for the 18 chains added on 2026-10-15 is the chain's own `finalized` block tag where the RPC supports it, otherwise 20 confirmations. **Both are our choice, not a number taken from the chain's documentation.** Confirm each
  against the chain's documentation before enabling it.
* **Explorer links** were checked to respond; they are display only.
* CCTP domains and Circle product flags are `null` (not verified) on the new chains.

## Spending limits and the `explicit` tier

The relayer's per-transaction cap, daily budget and minimum balance are written in the chain's native token. For ETH-priced chains (Base, OP, Arbitrum, Linea, Ink, Unichain, World Chain, Morph) a
tier default applies. For every mainnet whose native token is **not** ETH (Avalanche, Celo, Cronos, Sei, Sonic, Monad, HyperEVM, ...) no default is safe, because a default tuned for ETH would be far too small
or far too large. Those networks stay **closed** until the operator sets `RELAYER_POLICY_<NETWORK>`, for example:

```
RELAYER_POLICY_AVALANCHE_MAINNET={"maxFeePerTxWei":"20000000000000000","maxDailyGasWei":"500000000000000000","maxOpsPerDay":2000,"minBalanceWei":"100000000000000000"}
```

## Adding or enabling a network

1. Registry entry, then `pnpm verify:networks <id>` must pass.
2. Foundry deploy with `TREASURY`, `MAX_FEE_BPS` and `CONTRACT_VERSION`, then `pnpm finalize:deployment --network <id>` (also `--token EURC` where listed).
3. Set `RPC_URLS_<NETWORK>` (at least two providers), `RELAYER_POLICY_<NETWORK>` where required, `ENABLED_NETWORKS`, and for mainnets `ALLOW_MAINNET=true`.
4. The owner runs `pnpm approve:deployment` to approve the network for production.

## Not in the registry, and why

| Chain | Reason |
| --- | --- |
| EDGE | USDC probed OK on its public RPC (chain id 3343), but its explorer and native token could not be confirmed. Pending. |
| Pharos | USDC probed OK (chain id 1672), but its native token could not be confirmed. Pending. |
| Polygon PoS | In the registry but **not verified**: no RPC is configured in this environment, so the probe was never run. |
| ZKsync Era | zkSync derives CREATE2 addresses differently, so the ERC-1167 invoice clones would not land where the factory predicts. Not supported until that is solved. |
| Solana, Sui, Aptos, Stellar, NEAR, Algorand, Starknet, XRPL, Noble, Polkadot Asset Hub, Hedera | Not EVM. Each would need its own adapter (see the end of architecture.md section 6). |

**XDC** passed the probe, but its public RPC was slow and failed some requests: use a dedicated provider.

## Tokens

USDC on every network. EURC only where the network's own documentation lists it (Arc). USYC (permissioned), cirBTC (8 decimals, volatile) and WETH (bridged, 18 decimals) are not supported: invoices have no USD price source, and
a bridged token may not support EIP-3009.
