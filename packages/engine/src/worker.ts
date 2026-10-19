import type { Engine } from "./context";
import { recheckDeployments } from "./deployment-check";
import { custodyTick } from "./custody";
import { forwardTick } from "./forwarding";
import { expireDueIntents, replanSettlements } from "./recompute";
import { relayerTick } from "./relayer";
import { pruneSessions } from "./auth";
import { processWebhookJobs } from "./webhooks";
import { watcherTick } from "./watcher";

const failures = new Map<string, number>();

async function guarded<T>(e: Engine, network: string, what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    failures.set(`${network}:${what}`, 0);
    return r;
  } catch (err) {
    const k = `${network}:${what}`;
    const n = (failures.get(k) ?? 0) + 1;
    failures.set(k, n);
    e.log.error(`${what} failed`, { network, err: err instanceof Error ? err.message.slice(0, 300) : String(err), consecutive: n });
    if (n >= 5) {
      await e.alerts.raise({ key: `loop-failing:${k}`, severity: "critical", title: `${what} has failed ${n} times in a row (RPC outage?)`, detail: { network, error: err instanceof Error ? err.message.slice(0, 300) : String(err) } });
    }
    return null;
  }
}

let lastPrune = 0;
/** Expired sessions are removed at most once an hour. */
async function pruneSessionsOften(e: Engine): Promise<number> {
  const t = e.now().getTime();
  if (t - lastPrune < 3_600_000) return 0;
  lastPrune = t;
  return pruneSessions(e);
}

/** One full pass of all background duties. Stateless between calls; safe to run on several workers. */
export async function workerTick(e: Engine): Promise<void> {
  await Promise.all(
    [...e.chains.values()]
      .filter((c) => c.operational)
      .map(async (c) => {
        const id = c.network.id;
        await guarded(e, id, "watcher", () => watcherTick(e, id));
        await guarded(e, id, "relayer", () => relayerTick(e, id));
        await guarded(e, id, "forwarding", () => forwardTick(e, id));
        await guarded(e, id, "custody", () => custodyTick(e, id));
      }),
  );
  await guarded(e, "-", "deployment-check", () => recheckDeployments(e));
  await guarded(e, "-", "expiry", () => expireDueIntents(e));
  await guarded(e, "-", "replan", () => replanSettlements(e));
  await guarded(e, "-", "webhooks", () => processWebhookJobs(e));
  await guarded(e, "-", "sessions", () => pruneSessionsOften(e));
}

export function startWorkerLoop(e: Engine, intervalMs = 2000): { stop(): Promise<void> } {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  const loop = async () => {
    while (!stopped) {
      const started = Date.now();
      running = workerTick(e);
      await running;
      const wait = Math.max(200, intervalMs - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
    }
  };
  void loop();
  return { stop: async () => { stopped = true; await running; } };
}
