# Manual source verification checklist

One file does all 16 contracts: `standard-input.json` (in this folder). The explorer matches each address to its source by bytecode, so you never pick a contract name.

## Every contract, same steps

1. Open the verification page of the network:
   - Arc Testnet: https://explorer.testnet.arc.io/contract-verification
   - Arc Mainnet: https://explorer.arc.io/contract-verification
2. Contract address: paste it from the tables below.
3. License: MIT License (MIT).
4. Verification method: **Solidity (Standard JSON input)**.
5. Compiler: **v0.8.28+commit.7893614a** (type `0.8.28` in the search box).
6. Upload `standard-input.json`.
7. Click **Verify & publish** and solve the reCAPTCHA if it appears.
8. Open the address page: the Contract tab should show the source and a green check.

Compiler settings are already inside the JSON (optimizer on, 200 runs, EVM `paris`), so nothing else is asked.

## Arc Testnet (chain 5042002), explorer.testnet.arc.io (redeployed 2026-10-24 with default metadata, Sourcify exact match)

USDC set

| Contract | Address |
| --- | --- |
| VaultFactory | 0x9CF73da5594A6edB62928EB65Cfe2A62a0C10F08 |
| InvoiceDeposit (implementation) | 0xFAD5b71b2ECf9Ab553d54Bb94E93B26e37C18853 |
| InvoiceFactory | 0x761428302C7fD463D42338a7284a43026793855f |
| PaymentRouter | 0x2323E6da83644E7E30A0f9eCb1523F5b86405165 |

EURC set 

| Contract | Address |
| --- | --- |
| VaultFactory | 0x2b25cC1Fd31daA1364B342B08d5EA173828847Bb |
| InvoiceDeposit (implementation) | 0x1C31E4F2c6abb04c9847544901CBCf7706B1aDe8 |
| InvoiceFactory | 0x4fc43E574DE8a226fD5da334340c3Beb348C6adE |
| PaymentRouter | 0x2804DD604DFC8e81F139468a46d955f83981F50E |

## Arc Mainnet (chain 5042), explorer.arc.io

USDC set

| Contract | Address |
| --- | --- |
| VaultFactory | 0x258591720519F42775693Ff7da0a41406387a625 |
| InvoiceDeposit (implementation) | 0x79136c787DeE7e8583DaAD0f55683149c4BF184D |
| InvoiceFactory | 0x16091911885102D71A5aa3774AeD56Fb51e60538 |
| PaymentRouter | 0x396081691Ea3CBEDAa5D8A26595081cC76a79312 |

EURC set

| Contract | Address |
| --- | --- |
| VaultFactory | 0xBcA006285F0Bec19AdD48333B6f5fd8bD2BDA8e9 |
| InvoiceDeposit (implementation) | 0x75b553Baf2c926C0E29e53e551437C85De4c08E1 |
| InvoiceFactory | 0x1D9eb25f4eb550250BB5631ED451bBDA862FCbBf |
| PaymentRouter | 0x2Aed78F76fD40a1BAf6F00BDEe30Ec0ABcb06A30 |


## Regenerating the file

```shell
forge build --build-info --force
# the "input" field of out/build-info/*.json is the standard JSON
```
