# Database on Neon

Plinth uses plain Postgres through the `pg` driver. Every process (API, worker, migration CLI) reads one variable, `DATABASE_URL`. Neon works as is.

## Connect

1. In the Neon console open the project and copy the **direct** connection string (the host without `-pooler`). Migrations and the worker's `FOR UPDATE SKIP LOCKED` queue should not go through PgBouncer.
2. Set it on the API and worker services as `DATABASE_URL`, for example `postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require`. Keep it in the host's secret store. Never commit it.
3. Apply the schema with either of:
   - `RUN_MIGRATIONS=true` on the API service for one release (it migrates on start), or
   - `DATABASE_URL=... pnpm db:migrate` from a machine that can reach Postgres on port 5432.

For tests, `TEST_DATABASE_URL` may point at a disposable Neon branch: each test harness then creates its own throwaway database on that server.

## State of the existing `plinth-dev` project (checked 2026-11-07)

| Branch | Migrations applied | Notes |
| --- | --- | --- |
| `main` | **1 of 7** (only `0000`) | Older schema: no `merchants.fee_bps`, no payout, custody, token or email-verification tables. The current code cannot run on it until it is migrated. It holds 1 merchant and 1 payment intent. |
| `migrate-check-2026-11-07` | **7 of 7** | A copy-on-write branch of `main`. Migrations `0001` to `0006` were applied in one transaction and recorded in `drizzle.__drizzle_migrations` with the same hashes and timestamps the migrator uses, so `pnpm db:migrate` will treat it as up to date. 35 tables, existing rows kept. |

`main` was not changed. To bring it up to date, run the same migrations on it (set `RUN_MIGRATIONS=true` for one API release, or `pnpm db:migrate`), or make the migrated branch the primary one in the Neon console. Delete the branch when it is no longer needed.

## Not verified

The automated test suites were not run against Neon: the machine used for this work could only reach Neon over HTTPS, not on the Postgres port. The "real Postgres under several connections" item in `docs/verification.md` is therefore still open. Run `TEST_DATABASE_URL=... pnpm test` from a machine that can connect.
