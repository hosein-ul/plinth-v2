# Deployed and verified contracts

The 16 contracts Plinth uses, in order: network, then token set, then contract. Source of truth: [`deployments/arc-mainnet.json`](../deployments/arc-mainnet.json) and [`deployments/arc-testnet.json`](../deployments/arc-testnet.json). Public addresses only.

## What "verified" means here

| Check | How | Result |
| --- | --- | --- |
| Bytecode equals the build | `pnpm finalize:deployment` compares the on-chain runtime code with the compiled artifact (immutables masked) | all 16 pass (`bytecodeVerified: true`) |
| Wiring read back from the chain | token, chain id, version, treasury and fee cap are read from every contract; the API repeats this every 5 minutes and closes a network on any mismatch | pass |
| Offline CREATE2 equals on-chain `predict()` | checked by `finalize:deployment` | pass |
| Source published | Sourcify, checked on 2026-11-07 through `sourcify.dev/server/v2/contract/<chain>/<address>` | **16 of 16 `exact_match`** (creation and runtime) |

Not checked: how the Arc block explorers display each contract. Their servers refused automated requests from the machine used for this check, so open the explorer link on each row to see the Contract tab. Source verification files and steps are in [`contracts/verify-checklist.md`](../contracts/verify-checklist.md).

**Not independently audited.** Mainnet was approved with `audit: none: owner accepted risk` (see [`security-review.md`](security-review.md)).

## Arc Mainnet (chain id 5042)

- Status: `bytecodeVerified: true`, `productionApproved: true` (approved by hosein-ul on 2026-10-23, audit: none: owner accepted risk)
- Contract version: 2 · maximum fee: 100 bps (1%), fixed at deployment · vault settings delay: 86400 s
- Deployer and treasury (fee recipient): `0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2` (an ordinary account, no contract code)
- Verified on: 2026-10-23

### Arc Mainnet, USDC set

Token: `0x3600000000000000000000000000000000000000` · deploy block 27520124

| # | Contract | Address | Explorer | Sourcify | Deploy block |
| --- | --- | --- | --- | --- | --- |
| 1 | VaultFactory | `0x258591720519F42775693Ff7da0a41406387a625` | [0x2585…a625](https://explorer.arc.io/address/0x258591720519F42775693Ff7da0a41406387a625) | [exact_match](https://sourcify.dev/#/lookup/0x258591720519F42775693Ff7da0a41406387a625) | 27520124 |
| 2 | InvoiceDeposit (implementation) | `0x79136c787DeE7e8583DaAD0f55683149c4BF184D` | [0x7913…184D](https://explorer.arc.io/address/0x79136c787DeE7e8583DaAD0f55683149c4BF184D) | [exact_match](https://sourcify.dev/#/lookup/0x79136c787DeE7e8583DaAD0f55683149c4BF184D) | 27520124 |
| 3 | InvoiceFactory | `0x16091911885102D71A5aa3774AeD56Fb51e60538` | [0x1609…0538](https://explorer.arc.io/address/0x16091911885102D71A5aa3774AeD56Fb51e60538) | [exact_match](https://sourcify.dev/#/lookup/0x16091911885102D71A5aa3774AeD56Fb51e60538) | 27520124 |
| 4 | PaymentRouter | `0x396081691Ea3CBEDAa5D8A26595081cC76a79312` | [0x3960…9312](https://explorer.arc.io/address/0x396081691Ea3CBEDAa5D8A26595081cC76a79312) | [exact_match](https://sourcify.dev/#/lookup/0x396081691Ea3CBEDAa5D8A26595081cC76a79312) | 27520124 |

### Arc Mainnet, EURC set

Token: `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` · deploy block 27520186

| # | Contract | Address | Explorer | Sourcify | Deploy block |
| --- | --- | --- | --- | --- | --- |
| 5 | VaultFactory | `0xBcA006285F0Bec19AdD48333B6f5fd8bD2BDA8e9` | [0xBcA0…A8e9](https://explorer.arc.io/address/0xBcA006285F0Bec19AdD48333B6f5fd8bD2BDA8e9) | [exact_match](https://sourcify.dev/#/lookup/0xBcA006285F0Bec19AdD48333B6f5fd8bD2BDA8e9) | 27520186 |
| 6 | InvoiceDeposit (implementation) | `0x75b553Baf2c926C0E29e53e551437C85De4c08E1` | [0x75b5…08E1](https://explorer.arc.io/address/0x75b553Baf2c926C0E29e53e551437C85De4c08E1) | [exact_match](https://sourcify.dev/#/lookup/0x75b553Baf2c926C0E29e53e551437C85De4c08E1) | 27520186 |
| 7 | InvoiceFactory | `0x1D9eb25f4eb550250BB5631ED451bBDA862FCbBf` | [0x1D9e…CbBf](https://explorer.arc.io/address/0x1D9eb25f4eb550250BB5631ED451bBDA862FCbBf) | [exact_match](https://sourcify.dev/#/lookup/0x1D9eb25f4eb550250BB5631ED451bBDA862FCbBf) | 27520186 |
| 8 | PaymentRouter | `0x2Aed78F76fD40a1BAf6F00BDEe30Ec0ABcb06A30` | [0x2Aed…6A30](https://explorer.arc.io/address/0x2Aed78F76fD40a1BAf6F00BDEe30Ec0ABcb06A30) | [exact_match](https://sourcify.dev/#/lookup/0x2Aed78F76fD40a1BAf6F00BDEe30Ec0ABcb06A30) | 27520186 |

## Arc Testnet (chain id 5042002)

- Status: `bytecodeVerified: true`, `productionApproved: false` (testnet: not a production network)
- Contract version: 2 · maximum fee: 100 bps (1%), fixed at deployment · vault settings delay: 86400 s
- Deployer and treasury (fee recipient): `0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2` (an ordinary account, no contract code)
- Verified on: 2026-10-23

### Arc Testnet, USDC set

Token: `0x3600000000000000000000000000000000000000` · deploy block 68750896

| # | Contract | Address | Explorer | Sourcify | Deploy block |
| --- | --- | --- | --- | --- | --- |
| 9 | VaultFactory | `0x9CF73da5594A6edB62928EB65Cfe2A62a0C10F08` | [0x9CF7…0F08](https://explorer.testnet.arc.io/address/0x9CF73da5594A6edB62928EB65Cfe2A62a0C10F08) | [exact_match](https://sourcify.dev/#/lookup/0x9CF73da5594A6edB62928EB65Cfe2A62a0C10F08) | 68750896 |
| 10 | InvoiceDeposit (implementation) | `0xFAD5b71b2ECf9Ab553d54Bb94E93B26e37C18853` | [0xFAD5…8853](https://explorer.testnet.arc.io/address/0xFAD5b71b2ECf9Ab553d54Bb94E93B26e37C18853) | [exact_match](https://sourcify.dev/#/lookup/0xFAD5b71b2ECf9Ab553d54Bb94E93B26e37C18853) | 68750896 |
| 11 | InvoiceFactory | `0x761428302C7fD463D42338a7284a43026793855f` | [0x7614…855f](https://explorer.testnet.arc.io/address/0x761428302C7fD463D42338a7284a43026793855f) | [exact_match](https://sourcify.dev/#/lookup/0x761428302C7fD463D42338a7284a43026793855f) | 68750896 |
| 12 | PaymentRouter | `0x2323E6da83644E7E30A0f9eCb1523F5b86405165` | [0x2323…5165](https://explorer.testnet.arc.io/address/0x2323E6da83644E7E30A0f9eCb1523F5b86405165) | [exact_match](https://sourcify.dev/#/lookup/0x2323E6da83644E7E30A0f9eCb1523F5b86405165) | 68750896 |

### Arc Testnet, EURC set

Token: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` · deploy block 68750957

| # | Contract | Address | Explorer | Sourcify | Deploy block |
| --- | --- | --- | --- | --- | --- |
| 13 | VaultFactory | `0x2b25cC1Fd31daA1364B342B08d5EA173828847Bb` | [0x2b25…47Bb](https://explorer.testnet.arc.io/address/0x2b25cC1Fd31daA1364B342B08d5EA173828847Bb) | [exact_match](https://sourcify.dev/#/lookup/0x2b25cC1Fd31daA1364B342B08d5EA173828847Bb) | 68750957 |
| 14 | InvoiceDeposit (implementation) | `0x1C31E4F2c6abb04c9847544901CBCf7706B1aDe8` | [0x1C31…aDe8](https://explorer.testnet.arc.io/address/0x1C31E4F2c6abb04c9847544901CBCf7706B1aDe8) | [exact_match](https://sourcify.dev/#/lookup/0x1C31E4F2c6abb04c9847544901CBCf7706B1aDe8) | 68750957 |
| 15 | InvoiceFactory | `0x4fc43E574DE8a226fD5da334340c3Beb348C6adE` | [0x4fc4…6adE](https://explorer.testnet.arc.io/address/0x4fc43E574DE8a226fD5da334340c3Beb348C6adE) | [exact_match](https://sourcify.dev/#/lookup/0x4fc43E574DE8a226fD5da334340c3Beb348C6adE) | 68750957 |
| 16 | PaymentRouter | `0x2804DD604DFC8e81F139468a46d955f83981F50E` | [0x2804…F50E](https://explorer.testnet.arc.io/address/0x2804DD604DFC8e81F139468a46d955f83981F50E) | [exact_match](https://sourcify.dev/#/lookup/0x2804DD604DFC8e81F139468a46d955f83981F50E) | 68750957 |

## Build fingerprints

The same four compiled artifacts back every set on both networks (keccak256 of the runtime code, immutables masked):

| Contract | Hash |
| --- | --- |
| VaultFactory | `0xdb3986b2b3ee3df26874896e9028ca1ecce9eddb5ca53853962a3d5875d109d9` |
| InvoiceDeposit | `0x2fa16cf012aea63fd6d7cb09bad44d19960ec90e76e81c831c17dc560a4b4706` |
| InvoiceFactory | `0x07795d95c71027531b02ed21ac4d60e6a37cecff866913b4b2eb7a1c843ed085` |
| PaymentRouter | `0x3c556afa82cbea8d424717e8fe399fd22e68b9ca2ac0588e944357413ae924b2` |

Solidity 0.8.28, optimizer 200 runs, EVM `paris`, MIT licence. No proxies, no admin role, no upgrade path.
