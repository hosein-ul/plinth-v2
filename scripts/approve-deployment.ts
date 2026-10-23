/**
 * Human gate for production use of a deployment. Without this flag a mainnet stays disabled even if its
 * contracts are deployed and byte-verified.
 *
 *   I_HAVE_COMPLETED_THE_MAINNET_CHECKLIST=yes pnpm approve:deployment --network arc-mainnet \
 *       --reviewer "Name <email>" --audit "report id or URL"
 *
 * Requires: an audit reference ("none: owner accepted risk" when there is none) and an explicit
 * reviewer identity. The approval is recorded inside the deployment file so it is part of the repo history.
 * The application additionally requires ENABLED_NETWORKS + ALLOW_MAINNET=true at runtime.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deploymentsDir } from "@plinth/blockchain";

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1] ?? "true"]] : a), []));
const { network, reviewer, audit } = args;
if (!network || !reviewer || !audit) throw new Error("--network, --reviewer and --audit are all required");
if (process.env.I_HAVE_COMPLETED_THE_MAINNET_CHECKLIST !== "yes") {
  throw new Error("Set I_HAVE_COMPLETED_THE_MAINNET_CHECKLIST=yes to confirm that you approve this deployment for production");
}
const file = join(deploymentsDir(), `${network}.json`);
if (!existsSync(file)) throw new Error(`No deployment record for ${network}. Run finalize:deployment first.`);
const d = JSON.parse(readFileSync(file, "utf8"));
if (!d.bytecodeVerified) throw new Error("Deployment bytecode is not verified");
// The approval covers every token set in the record, so each one must be byte-verified too.
for (const [sym, t] of Object.entries((d.tokens ?? {}) as Record<string, { bytecodeVerified?: boolean }>)) {
  if (!t.bytecodeVerified) throw new Error(`The ${sym} contracts are not byte-verified`);
}
d.productionApproved = true;
d.approval = { reviewer, audit, approvedAt: new Date().toISOString() };
writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
console.log(`Approved ${network} for production use by "${reviewer}" (audit: ${audit}).`);
