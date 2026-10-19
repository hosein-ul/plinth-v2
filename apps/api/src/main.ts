import { connect } from "@plinth/db";
import { createEngine, consoleLogger, startWorkerLoop } from "@plinth/engine";
import { buildServer } from "./server";
import { buildOpenApi } from "./openapi";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (databaseUrl.startsWith("pglite://")) {
  console.warn("DATABASE_URL points at embedded PGlite: the worker must run in the same process (use `pnpm dev:stack`).");
}

if (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY === undefined && process.env.RENDER !== "true") {
  console.warn("TRUST_PROXY is not set. Behind a proxy or the web app every client then looks like one address and shares its rate limits; set TRUST_PROXY=true (and make sure only your proxy can reach this port) or TRUST_PROXY=false to silence this.");
}

const handle = connect(databaseUrl);
if (process.env.RUN_MIGRATIONS === "true") await handle.migrate();

const engine = await createEngine({ db: handle.db, logger: consoleLogger });
const { app, routes } = await buildServer(engine, {
  adminToken: process.env.ADMIN_API_TOKEN,
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  // Render (RENDER=true) always puts the service behind its own proxy; without trusting it every client would share one address.
  trustProxy: process.env.TRUST_PROXY !== undefined ? process.env.TRUST_PROXY === "true" : process.env.RENDER === "true",
  logger: true,
});
app.get("/v1/openapi.json", async () => buildOpenApi(routes, process.env.PUBLIC_API_URL));

// A small deployment can run the background duties (watcher, relayer, webhooks) in the same process as the API.
const loop = process.env.RUN_WORKER === "true" ? startWorkerLoop(engine, Number(process.env.WORKER_INTERVAL_MS ?? 2000)) : undefined;

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
await app.listen({ port, host: process.env.API_HOST ?? "0.0.0.0" });
for (const s of ["SIGINT", "SIGTERM"] as const) {
  process.on(s, async () => {
    await loop?.stop();
    await app.close();
    await handle.close();
    process.exit(0);
  });
}
