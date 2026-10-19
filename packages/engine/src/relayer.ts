import { and, asc, eq, gt, inArray, schema, sql, type Executor } from "@plinth/db";
import { bumpFees, gasCost, MerchantVaultAbi, quoteFees, type FeeQuote } from "@plinth/blockchain";
import { newId } from "@plinth/shared";
import { decodeEventLog, keccak256, type Hex, type TransactionReceipt } from "viem";
import { audit } from "./audit";
import { chainOf, norm, tokenRuntime, type ChainRuntime, type Engine } from "./context";
import { ingestRouterPayment, ingestSweep } from "./ingest";
import { recomputeIntent } from "./recompute";
import { emitEvent } from "./webhooks";

type Op = typeof schema.relayerOperations.$inferSelect;

/**
 * Work that anyone with a free account can create (vaults, forwards, policy activations) may use only this share of the daily
 * operation budget. Sweeps of funded invoices and customers' wallet payments always keep the rest, so spam cannot stop settlements.
 */
const KIND_SHARE: Record<string, number> = { CREATE_VAULT: 0.15, FORWARD: 0.2, APPLY_SETTLEMENT: 0.05 };

const locks = new Map<string, Promise<unknown>>();
/** Serialise relayer work per network inside this process (one signer => one nonce sequence). */
function withNetworkLock<T>(networkId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(networkId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  locks.set(networkId, next);
  return next;
}

export async function isPaused(e: Engine, networkId: string): Promise<{ paused: boolean; reason?: string }> {
  if (process.env.RELAYER_KILL_SWITCH === "true") return { paused: true, reason: "RELAYER_KILL_SWITCH env" };
  const [s] = await e.db.select().from(schema.relayerState).where(eq(schema.relayerState.networkId, networkId));
  return { paused: !!s?.paused, reason: s?.pauseReason ?? undefined };
}

/** Emergency disablement of NEW relayer actions for a network. In-flight transactions still reconcile. */
export async function setPaused(e: Engine, networkId: string, paused: boolean, reason: string | undefined, actor: { id?: string }) {
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.relayerState).values({ networkId, paused, pauseReason: reason ?? null }).onConflictDoUpdate({ target: schema.relayerState.networkId, set: { paused, pauseReason: reason ?? null, updatedAt: e.now() } });
    await audit(tx, { actor: { type: "USER", id: actor.id }, action: paused ? "relayer.paused" : "relayer.resumed", targetType: "network", targetId: networkId, data: { reason } });
  });
  await e.alerts.raise({ key: `relayer-pause:${networkId}:${paused}`, severity: paused ? "critical" : "info", title: paused ? "Relayer paused" : "Relayer resumed", detail: { networkId, reason } });
}

export async function relayerTick(e: Engine, networkId: string): Promise<{ confirmed: number; submitted: number; replaced: number }> {
  const chain = chainOf(e, networkId);
  if (!chain.signer || !chain.operational) return { confirmed: 0, submitted: 0, replaced: 0 };
  return withNetworkLock(networkId, async () => {
    const r = await reconcileSubmitted(e, chain);
    const s = await submitQueued(e, chain);
    await monitorBalance(e, chain);
    return { confirmed: r.confirmed, replaced: r.replaced, submitted: s };
  });
}

// ------------------------------------------------------------------ reconcile in-flight ops

async function reconcileSubmitted(e: Engine, chain: ChainRuntime) {
  const net = chain.network;
  const out = { confirmed: 0, replaced: 0 };
  const ops = await e.db
    .select()
    .from(schema.relayerOperations)
    .where(and(eq(schema.relayerOperations.networkId, net.id), eq(schema.relayerOperations.status, "SUBMITTED")))
    .orderBy(asc(schema.relayerOperations.nonce));
  if (ops.length === 0) return out;
  const latestNonce = BigInt(await chain.client.getTransactionCount({ address: chain.signer!.address, blockTag: "latest" }));

  for (const op of ops) {
    let receipt: TransactionReceipt | null = null;
    for (const h of [...op.txHashes].reverse()) {
      try {
        receipt = await chain.client.getTransactionReceipt({ hash: h as Hex });
        break;
      } catch {
        /* not mined yet */
      }
    }
    if (receipt) {
      await finalizeOp(e, chain, op, receipt);
      out.confirmed++;
      continue;
    }

    const ageSec = (e.now().getTime() - (op.submittedAt ?? op.createdAt).getTime()) / 1000;
    if (op.nonce !== null && latestNonce > op.nonce) {
      // The nonce was consumed by a different transaction: ours was dropped/replaced externally.
      await e.db.update(schema.relayerOperations).set({ status: "QUEUED", nonce: null, rawTx: null, lastError: "nonce consumed by another transaction; re-queued", nextAttemptAt: e.now() }).where(eq(schema.relayerOperations.id, op.id));
      continue;
    }
    // Make sure the node still knows the transaction (it may have been evicted after a restart).
    const known = await chain.client.getTransaction({ hash: op.txHash as Hex }).catch(() => null);
    if (!known && op.rawTx) {
      await chain.client.sendRawTransaction({ serializedTransaction: op.rawTx as Hex }).catch(() => undefined);
    }
    if (ageSec > chain.policy.replaceAfterSeconds) {
      const replacements = op.txHashes.length - 1;
      if (replacements >= chain.policy.maxReplacements) {
        await e.db.update(schema.relayerOperations).set({ lastError: "stuck: max fee replacements reached" }).where(eq(schema.relayerOperations.id, op.id));
        await e.alerts.raise({ key: `stuck-op:${op.id}`, severity: "critical", title: "Relayer transaction is stuck", detail: { opId: op.id, network: net.id, nonce: op.nonce?.toString(), txHash: op.txHash } });
        continue;
      }
      if (await replaceOp(e, chain, op)) out.replaced++;
    }
  }
  return out;
}

async function replaceOp(e: Engine, chain: ChainRuntime, op: Op): Promise<boolean> {
  const bumped = bumpFees({ maxFeePerGas: op.maxFeePerGas!, maxPriorityFeePerGas: op.maxPriorityFeePerGas ?? 0n });
  if (op.gasLimit! * bumped.maxFeePerGas > chain.policy.maxFeePerTxWei) {
    await e.alerts.raise({ key: `replace-capped:${op.id}`, severity: "warning", title: "Fee replacement would exceed per-transaction fee cap", detail: { opId: op.id, network: chain.network.id } });
    return false;
  }
  const raw = await chain.signer!.signTransaction({
    type: "eip1559", chainId: chain.network.chainId, nonce: Number(op.nonce), to: op.toAddress as Hex, data: op.calldata as Hex,
    gas: op.gasLimit!, maxFeePerGas: bumped.maxFeePerGas, maxPriorityFeePerGas: bumped.maxPriorityFeePerGas, value: 0n,
  });
  const hash = keccak256(raw);
  await e.db.update(schema.relayerOperations).set({
    rawTx: raw, txHash: hash, txHashes: [...op.txHashes, hash], maxFeePerGas: bumped.maxFeePerGas, maxPriorityFeePerGas: bumped.maxPriorityFeePerGas, submittedAt: e.now(), attempts: op.attempts + 1,
  }).where(eq(schema.relayerOperations.id, op.id));
  await chain.client.sendRawTransaction({ serializedTransaction: raw }).catch((err) => e.log.warn("replacement broadcast failed", { opId: op.id, err: String(err).slice(0, 200) }));
  e.log.info("relayer replaced stuck transaction", { opId: op.id, hash });
  return true;
}

// ------------------------------------------------------------------ submit queued ops

async function submitQueued(e: Engine, chain: ChainRuntime): Promise<number> {
  const net = chain.network;
  const pause = await isPaused(e, net.id);
  if (pause.paused) return 0;

  const ops = await e.db
    .select()
    .from(schema.relayerOperations)
    .where(and(eq(schema.relayerOperations.networkId, net.id), eq(schema.relayerOperations.status, "QUEUED"), sql`${schema.relayerOperations.nextAttemptAt} <= ${e.now()}`))
    .orderBy(asc(schema.relayerOperations.createdAt))
    .limit(20);
  let sent = 0;

  for (const op of ops) {
    const since = new Date(e.now().getTime() - 86_400_000);
    const [usage] = await e.db
      .select({
        count: sql<number>`count(*)::int`,
        spent: sql<string>`coalesce(sum(case when ${schema.relayerOperations.status} = 'SUBMITTED' then ${schema.relayerOperations.gasLimit} * ${schema.relayerOperations.maxFeePerGas} else coalesce(${schema.relayerOperations.feeNativeWei}, 0) end), 0)`,
      })
      .from(schema.relayerOperations)
      .where(and(eq(schema.relayerOperations.networkId, net.id), inArray(schema.relayerOperations.status, ["SUBMITTED", "CONFIRMED", "REVERTED"]), gt(schema.relayerOperations.submittedAt, since)));
    if ((usage?.count ?? 0) >= chain.policy.maxOpsPerDay) {
      await e.alerts.raise({ key: `ops-cap:${net.id}`, severity: "critical", title: "Relayer daily operation cap reached", detail: { network: net.id, cap: chain.policy.maxOpsPerDay } });
      break;
    }

    const share = KIND_SHARE[op.kind];
    if (share !== undefined) {
      const [mine] = await e.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.relayerOperations)
        .where(and(eq(schema.relayerOperations.networkId, net.id), eq(schema.relayerOperations.kind, op.kind), inArray(schema.relayerOperations.status, ["SUBMITTED", "CONFIRMED", "REVERTED"]), gt(schema.relayerOperations.submittedAt, since)));
      if ((mine?.count ?? 0) >= Math.max(1, Math.floor(chain.policy.maxOpsPerDay * share))) {
        await e.alerts.raise({ key: `kind-cap:${net.id}:${op.kind}`, severity: "warning", title: `Relayer share for ${op.kind} operations is used up; they wait so sweeps and wallet payments keep their budget`, detail: { network: net.id, kind: op.kind } });
        await e.db.update(schema.relayerOperations).set({ nextAttemptAt: new Date(e.now().getTime() + 600_000) }).where(eq(schema.relayerOperations.id, op.id));
        continue;
      }
    }

    // Simulate first: a call that would revert must not cost gas.
    let gas: bigint;
    try {
      gas = await chain.client.estimateGas({ account: chain.signer!.address, to: op.toAddress as Hex, data: op.calldata as Hex });
    } catch (err) {
      await failOp(e, chain, op, `simulation reverted: ${shortError(err)}`);
      continue;
    }
    gas = (gas * 130n) / 100n + 10_000n;
    const fees: FeeQuote = await quoteFees(chain.client, net);
    const maxCost = gas * fees.maxFeePerGas;

    if (maxCost > chain.policy.maxFeePerTxWei) {
      await e.alerts.raise({ key: `fee-cap:${net.id}`, severity: "warning", title: "Network fees exceed the per-transaction cap; operation deferred", detail: { network: net.id, maxCostWei: maxCost.toString(), capWei: chain.policy.maxFeePerTxWei.toString() } });
      await e.db.update(schema.relayerOperations).set({ nextAttemptAt: new Date(e.now().getTime() + 60_000) }).where(eq(schema.relayerOperations.id, op.id));
      continue;
    }
    if (BigInt(usage?.spent ?? "0") + maxCost > chain.policy.maxDailyGasWei) {
      await e.alerts.raise({ key: `gas-cap:${net.id}`, severity: "critical", title: "Relayer daily gas budget exhausted; operations paused", detail: { network: net.id } });
      break;
    }
    const balance = await chain.client.getBalance({ address: chain.signer!.address });
    if (balance < maxCost + chain.policy.minBalanceWei) {
      await e.alerts.raise({ key: `balance-block:${net.id}`, severity: "critical", title: "Relayer balance too low to submit; operations blocked", detail: { network: net.id, balanceWei: balance.toString(), signer: chain.signer!.address } });
      break;
    }

    const pending = BigInt(await chain.client.getTransactionCount({ address: chain.signer!.address, blockTag: "pending" }));
    const [{ maxNonce } = { maxNonce: null }] = await e.db
      .select({ maxNonce: sql<string | null>`max(${schema.relayerOperations.nonce})` })
      .from(schema.relayerOperations)
      .where(and(eq(schema.relayerOperations.networkId, net.id), eq(schema.relayerOperations.status, "SUBMITTED")));
    const dbNext = maxNonce === null ? 0n : BigInt(maxNonce) + 1n;
    const nonce = pending > dbNext ? pending : dbNext;

    const raw = await chain.signer!.signTransaction({
      type: "eip1559", chainId: net.chainId, nonce: Number(nonce), to: op.toAddress as Hex, data: op.calldata as Hex,
      gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, value: 0n,
    });
    const hash = keccak256(raw);

    // Persist BEFORE broadcasting so a crash cannot lose track of a transaction that may land.
    await e.db.transaction(async (tx) => {
      await tx.update(schema.relayerOperations).set({
        status: "SUBMITTED", signerAddress: norm(chain.signer!.address), nonce, rawTx: raw, txHash: hash, txHashes: [hash], gasLimit: gas,
        maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, submittedAt: e.now(), attempts: op.attempts + 1, lastError: null,
      }).where(eq(schema.relayerOperations.id, op.id));
      await onSubmitted(e, tx, op, hash);
    });
    try {
      await chain.client.sendRawTransaction({ serializedTransaction: raw });
      sent++;
    } catch (err) {
      const msg = shortError(err);
      if (/already known|known transaction|already imported/i.test(msg)) {
        sent++;
        continue;
      }
      // Not accepted by the node: release the nonce and retry later with backoff.
      await e.db.update(schema.relayerOperations).set({ status: "QUEUED", nonce: null, rawTx: null, txHash: null, txHashes: [], lastError: `broadcast rejected: ${msg}`, nextAttemptAt: new Date(e.now().getTime() + 15_000 * 2 ** Math.min(op.attempts, 6)) }).where(eq(schema.relayerOperations.id, op.id));
      e.log.warn("relayer broadcast rejected", { opId: op.id, err: msg });
    }
  }
  return sent;
}

// ------------------------------------------------------------------ finalise an op from its receipt

async function finalizeOp(e: Engine, chain: ChainRuntime, op: Op, receipt: TransactionReceipt) {
  const net = chain.network;
  const cost = gasCost(net, receipt.gasUsed, receipt.effectiveGasPrice);
  const ok = receipt.status === "success";
  await e.db.update(schema.relayerOperations).set({
    status: ok ? "CONFIRMED" : "REVERTED", txHash: receipt.transactionHash, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice,
    feeNativeWei: cost.nativeWei, feeUsdcUnits: cost.usdcUnits, confirmedAt: e.now(), lastError: ok ? null : "transaction reverted on-chain",
    // The calldata of a wallet payment carries the customer's signature: wipe it once terminal.
    calldata: op.kind === "WALLET_PAYMENT" ? "0x" : op.calldata, rawTx: null,
  }).where(eq(schema.relayerOperations.id, op.id));

  const info = await chain.adapter.getHeadInfo();
  if (!ok) {
    await failOp(e, chain, { ...op, status: "REVERTED" }, "transaction reverted on-chain", true);
    return;
  }
  // Decode with the adapter of the token this operation served: its router is the one whose payments count.
  const tr = tokenRuntime(chain, op.tokenSymbol, { open: false });
  const events = tr.adapter.decodeReceiptEvents(receipt);

  if (op.kind === "DEPLOY_AND_SWEEP") {
    const [stl] = await e.db.select().from(schema.settlements).where(eq(schema.settlements.id, op.relatedId ?? ""));
    if (stl) {
      await e.db.update(schema.settlements).set({ txHash: receipt.transactionHash }).where(eq(schema.settlements.id, stl.id));
      await e.db.update(schema.invoiceAddresses).set({ deployedAt: e.now(), deployTxHash: receipt.transactionHash }).where(and(eq(schema.invoiceAddresses.id, stl.invoiceAddressId ?? ""), sql`${schema.invoiceAddresses.deployedAt} is null`));
      if (events.sweeps.length === 0) {
        // Balance was already swept by someone else; the watcher will account for that sweep.
        await e.db.transaction(async (tx) => {
          await tx.update(schema.settlements).set({ status: "CONFIRMED", sweptAmount: 0n, confirmedAt: e.now() }).where(eq(schema.settlements.id, stl.id));
          if (stl.paymentIntentId) await recomputeIntent(e, tx, stl.paymentIntentId);
        });
      }
      if (cost.usdcUnits !== null) {
        await e.db.insert(schema.ledgerEntries).values({ id: newId("led"), merchantId: stl.merchantId, paymentIntentId: stl.paymentIntentId, networkId: net.id, account: "GAS_COST", direction: "DEBIT", amount: cost.usdcUnits, refType: "relayer_operation", refId: op.id, idempotencyKey: `GAS_COST:${op.id}:DEBIT` }).onConflictDoNothing();
      }
    }
    for (const s of events.sweeps) await ingestSweep(e, chain, s, info);
  } else if (op.kind === "WALLET_PAYMENT") {
    await e.db.update(schema.paymentAttempts).set({ status: "CONFIRMED", txHash: receipt.transactionHash, updatedAt: e.now() }).where(eq(schema.paymentAttempts.relayerOperationId, op.id));
    for (const p of events.payments) await ingestRouterPayment(e, chain, p, info);
  } else if (op.kind === "CREATE_VAULT") {
    const [v] = await e.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.createRelayerOpId, op.id));
    if (v) {
      const registered = await tr.adapter.isRegisteredVault(v.vaultAddress as Hex);
      await e.db.transaction(async (tx) => {
        await tx.update(schema.merchantVaults).set({ status: registered ? "ACTIVE" : "FAILED", createTxHash: receipt.transactionHash }).where(eq(schema.merchantVaults.id, v.id));
        await audit(tx, { merchantId: v.merchantId, actor: { type: "RELAYER" }, action: registered ? "vault.created" : "vault.create_unverified", targetType: "merchant_vault", targetId: v.id, data: { vault: v.vaultAddress, txHash: receipt.transactionHash } });
      });
    }
  } else if (op.kind === "FORWARD") {
    await recordForward(e, chain, op, receipt);
  }
  e.log.info("relayer op confirmed", { opId: op.id, kind: op.kind, network: net.id, tx: receipt.transactionHash, feeWei: cost.nativeWei.toString() });
}

async function recordForward(e: Engine, chain: ChainRuntime, op: Op, receipt: TransactionReceipt) {
  for (const l of receipt.logs) {
    if (norm(l.address) !== norm(op.toAddress)) continue;
    try {
      const d = decodeEventLog({ abi: MerchantVaultAbi, data: l.data, topics: l.topics });
      if (d.eventName !== "Forwarded") continue;
      const [vault] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.networkId, chain.network.id), eq(schema.merchantVaults.vaultAddress, norm(op.toAddress))));
      if (!vault) continue;
      await e.db.transaction(async (tx) => {
        await tx.insert(schema.transactions).values({ id: newId("tx"), networkId: chain.network.id, txHash: receipt.transactionHash, logIndex: l.logIndex, kind: "FORWARD", merchantId: vault.merchantId, tokenAddress: norm(tokenRuntime(chain, vault.tokenSymbol, { open: false }).config.address), fromAddress: norm(vault.vaultAddress), toAddress: norm(d.args.destination), amount: d.args.amount, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, status: "FINAL", finalizedAt: e.now() }).onConflictDoNothing();
        await tx.insert(schema.ledgerEntries).values({ id: newId("led"), merchantId: vault.merchantId, paymentIntentId: null, networkId: chain.network.id, account: "FORWARDED", direction: "CREDIT", amount: d.args.amount, refType: "tx", refId: `${receipt.transactionHash}:${l.logIndex}`, idempotencyKey: `FORWARDED:${receipt.transactionHash}:${l.logIndex}:CREDIT` }).onConflictDoNothing();
      });
    } catch {
      /* not a vault event */
    }
  }
}

async function onSubmitted(e: Engine, tx: Executor, op: Op, hash: string) {
  if (op.kind === "DEPLOY_AND_SWEEP" && op.relatedId) {
    const [stl] = await tx.select().from(schema.settlements).where(eq(schema.settlements.id, op.relatedId));
    if (stl) {
      await tx.update(schema.settlements).set({ status: "SUBMITTED", txHash: hash, submittedAt: e.now() }).where(eq(schema.settlements.id, stl.id));
      const [intent] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, stl.paymentIntentId ?? ""));
      if (intent) {
        await emitEvent(e, tx, { merchantId: intent.merchantId, environment: intent.environment, type: "settlement.submitted", paymentIntentId: intent.id, dedupeKey: `settlement.submitted:${stl.id}`, extra: { settlement: { id: stl.id, tx_hash: hash, network: stl.networkId, expected_units: stl.expectedAmount.toString() } } });
        await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: intent.id, type: "settlement.submitted", data: { network: stl.networkId, tx_hash: hash } });
        await recomputeIntent(e, tx, intent.id);
      }
    }
  } else if (op.kind === "WALLET_PAYMENT") {
    await tx.update(schema.paymentAttempts).set({ status: "SUBMITTED", txHash: hash, updatedAt: e.now() }).where(eq(schema.paymentAttempts.relayerOperationId, op.id));
  } else if (op.kind === "CREATE_VAULT") {
    await tx.update(schema.merchantVaults).set({ status: "DEPLOYING" }).where(eq(schema.merchantVaults.createRelayerOpId, op.id));
  }
}

/** Terminal failure of an operation (simulation revert, on-chain revert). Updates the related record. */
async function failOp(e: Engine, chain: ChainRuntime, op: Op, reason: string, alreadyMarked = false) {
  await e.db.transaction(async (tx) => {
    if (!alreadyMarked) {
      await tx.update(schema.relayerOperations).set({ status: "FAILED", lastError: reason.slice(0, 500), calldata: op.kind === "WALLET_PAYMENT" ? "0x" : op.calldata, rawTx: null }).where(eq(schema.relayerOperations.id, op.id));
    }
    if (op.kind === "DEPLOY_AND_SWEEP" && op.relatedId) {
      const [stl] = await tx.select().from(schema.settlements).where(eq(schema.settlements.id, op.relatedId));
      if (stl) {
        await tx.update(schema.settlements).set({ status: "FAILED", failureReason: reason.slice(0, 500) }).where(eq(schema.settlements.id, stl.id));
        const [intent] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, stl.paymentIntentId ?? ""));
        if (intent) {
          await emitEvent(e, tx, { merchantId: intent.merchantId, environment: intent.environment, type: "settlement.failed", paymentIntentId: intent.id, dedupeKey: `settlement.failed:${stl.id}`, extra: { settlement: { id: stl.id, reason, network: stl.networkId } } });
          await recomputeIntent(e, tx, intent.id);
        }
      }
    } else if (op.kind === "WALLET_PAYMENT") {
      await tx.update(schema.paymentAttempts).set({ status: "FAILED", error: reason.slice(0, 300), updatedAt: e.now() }).where(eq(schema.paymentAttempts.relayerOperationId, op.id));
    } else if (op.kind === "CREATE_VAULT") {
      await tx.update(schema.merchantVaults).set({ status: "FAILED" }).where(eq(schema.merchantVaults.createRelayerOpId, op.id));
    }
  });
  await e.alerts.raise({ key: `op-failed:${op.id}`, severity: "critical", title: `Relayer operation failed (${op.kind})`, detail: { opId: op.id, network: chain.network.id, reason } });
}

async function monitorBalance(e: Engine, chain: ChainRuntime) {
  const bal = await chain.client.getBalance({ address: chain.signer!.address }).catch(() => null);
  if (bal !== null && bal < chain.policy.lowBalanceAlertWei) {
    await e.alerts.raise({ key: `low-balance:${chain.network.id}`, severity: "warning", title: "Relayer operational balance is low", detail: { network: chain.network.id, signer: chain.signer!.address, balanceWei: bal.toString(), thresholdWei: chain.policy.lowBalanceAlertWei.toString() } });
  }
}

function shortError(err: unknown): string {
  const m = err as { shortMessage?: string; message?: string };
  return (m.shortMessage ?? m.message ?? String(err)).replace(/\s+/g, " ").slice(0, 240);
}
