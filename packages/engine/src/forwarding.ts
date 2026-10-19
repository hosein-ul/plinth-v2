import { and, eq, gt, inArray, schema, sql } from "@plinth/db";
import { newId } from "@plinth/shared";
import { getAddress } from "viem";
import { chainOf, norm, type Engine } from "./context";

/**
 * Drives vault-level settlement policy for vaults whose OWNER enabled INSTANT_FORWARD or
 * THRESHOLD_OR_PERIODIC. The relayer only calls permissionless functions; the vault itself enforces
 * the owner-authorised destination, so this code cannot misdirect funds even if it is compromised.
 */
const MAX_VAULTS_PER_TICK = 50;
/** A vault gets at most one forward per this long, so a stream of tiny deposits cannot turn into a stream of relayer transactions. */
const FORWARD_COOLDOWN_MS = 120_000;

export async function forwardTick(e: Engine, networkId: string): Promise<{ forwarded: number; activated: number }> {
  const chain = chainOf(e, networkId);
  const res = { forwarded: 0, activated: 0 };
  if (!chain.operational || !chain.signer) return res;
  // Bounded work per tick: the vaults checked longest ago go first, so thousands of vaults cost a fixed number of RPC calls per pass.
  const vaults = await e.db
    .select()
    .from(schema.merchantVaults)
    .where(and(eq(schema.merchantVaults.networkId, networkId), eq(schema.merchantVaults.status, "ACTIVE")))
    .orderBy(sql`${schema.merchantVaults.cachedAt} asc nulls first`)
    .limit(MAX_VAULTS_PER_TICK);
  const block = await chain.client.getBlock();
  for (const v of vaults) {
    const s = await chain.adapter.readVault(getAddress(v.vaultAddress)).catch(() => null);
    if (!s) continue;
    await e.db.update(schema.merchantVaults).set({ cachedMode: s.mode, cachedDestination: norm(s.destination), cachedBalance: s.balance, cachedAt: e.now() }).where(eq(schema.merchantVaults.id, v.id));

    // An operation of this kind that is still waiting or was created a moment ago means: do not queue another one.
    const recent = await e.db
      .select({ kind: schema.relayerOperations.kind })
      .from(schema.relayerOperations)
      .where(and(eq(schema.relayerOperations.relatedType, "merchant_vault"), eq(schema.relayerOperations.relatedId, v.id), inArray(schema.relayerOperations.kind, ["FORWARD", "APPLY_SETTLEMENT"]), sql`(${schema.relayerOperations.status} in ('QUEUED','SUBMITTED') or ${gt(schema.relayerOperations.createdAt, new Date(e.now().getTime() - FORWARD_COOLDOWN_MS))})`));
    const hasOpen = (kind: string) => recent.some((r) => r.kind === kind);

    if (s.pending && block.timestamp >= s.pending.effectiveAt && !hasOpen("APPLY_SETTLEMENT")) {
      const call = chain.adapter.encodeApplyPending(s.address); // vault calls do not depend on the token
      const r = await e.db.insert(schema.relayerOperations).values({ id: newId("rop"), networkId, kind: "APPLY_SETTLEMENT", tokenSymbol: v.tokenSymbol, dedupeKey: `apply:${norm(v.vaultAddress)}:${s.pending.effectiveAt}`, toAddress: norm(call.to), calldata: call.data, relatedType: "merchant_vault", relatedId: v.id }).onConflictDoNothing().returning({ id: schema.relayerOperations.id });
      if (r.length) res.activated++;
    }
    const dust = s.mode === "INSTANT_FORWARD" && s.balance < chain.policy.minSweepUnits; // not worth a transaction
    if (s.mode !== "BALANCE_IN_VAULT" && s.canForward && !dust && !hasOpen("FORWARD")) {
      const call = chain.adapter.encodeForward(s.address);
      const r = await e.db.insert(schema.relayerOperations).values({ id: newId("rop"), networkId, kind: "FORWARD", tokenSymbol: v.tokenSymbol, dedupeKey: `forward:${norm(v.vaultAddress)}:${s.balance}:${block.number}`.slice(0, 200), toAddress: norm(call.to), calldata: call.data, relatedType: "merchant_vault", relatedId: v.id }).onConflictDoNothing().returning({ id: schema.relayerOperations.id });
      if (r.length) res.forwarded++;
    }
  }
  return res;
}
