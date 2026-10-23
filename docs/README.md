# Documentation

| Document | For | What is in it |
| --- | --- | --- |
| [architecture.md](architecture.md) | engineers | Contracts and trust boundaries, counterfactual addresses, payment lifecycle, relayer, networks, fee and tokens, payout modes, custody |
| [api-guide.md](api-guide.md) + [openapi.json](openapi.json) | integrators | Authentication, idempotency, payments, webhooks, refunds, payout methods, custody, settlement policy |
| [mcp.md](mcp.md) | integrators using an AI assistant | The hosted MCP server: one URL and a key, all 29 tools, inputs, errors, security |
| [networks.md](networks.md) | operators | All 26 registry networks, how each fact was verified, what is pending and why, spending limits |
| [operations.md](operations.md) | operators | Processes, secrets, every configuration variable, alerts, emergency stop, procedures (treasury rotation, adding a token) |
| [threat-model.md](threat-model.md) | security | Assets, actors, mitigations, what a compromised backend can and cannot do, payout and custody trade-offs |
| [security-review.md](security-review.md) | security, launch | The internal review of 2026-10-15 (not an audit): tools, results, findings, what an audit must cover |
| [verification.md](verification.md) | everyone | What was tested, with real counts, and what was **not** done |
| [DEPLOY-HANDOFF.md](DEPLOY-HANDOFF.md) | whoever deploys | Current state, security rules, preflight, Arc mainnet deploy commands, approval, Render configuration, canary, rollback |
| [deploy-testnet.md](deploy-testnet.md) | operators | Deploying to a testnet |
| [circle-integrations.md](circle-integrations.md) | engineers | CCTP, Gateway, Gas Station: verified facts and status |

Status in one line: **live on Arc mainnet (USDC and EURC), pre-audit.** Other networks open one by one after deployment and byte verification; start with small amounts.
