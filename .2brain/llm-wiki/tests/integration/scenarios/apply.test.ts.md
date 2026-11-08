---
source: tests/integration/scenarios/apply.test.ts
sha256: c2f69177e432eb95efd8dbb38e4863f31af344c95db911013751d03c3f78806d
generated_at: 2026-11-08T09:46:47.833462+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/apply.test.ts

## Purpose

Integration test for the `scenarios/apply.ts` CLI. It exercises the three runtime gates (NODE_ENV refusal, non-empty-database refusal, `--reset` re-seeding) plus the `--describe-to` output, by spawning the real script as a child process against a fresh database on the shared test Mongo server.

## Key elements

- **`runApply(args, dbUri, nodeEnv?)`** — Spawns `scenarios/apply.ts` via `execFile` + `tsx` with controlled env (Redis/RabbitMQ disabled), and resolves to an `ApplyResult`. The `execFile` callback error is intentionally ignored; the `close` event carries the exit status.
- **`ApplyResult`** — `{ status: number | null, stdout, stderr }` returned by `runApply`.
- **`freshDbUri()`** — Returns a unique `mongodb://…/apply-<uuid8>` URI on the shared test server, built via `URL.pathname` mutation (not string concat) to avoid clobbering the `?replicaSet=` query parameter.
- **`NAMED_ACCOUNT_COUNT`** — `Object.keys(seedCredentials).length`; the expected user count after a `blank` seed.
- **`APPLY_TIMEOUT_MS`** (30 s) — Jest timeout for a single apply run; the compound seed→refuse→reset test uses `3 × APPLY_TIMEOUT_MS`.
- **Three tests** — (1) NODE_ENV gate for `production`/`staging`/unset; (2) seed → refuse-non-empty → `--reset` re-seed; (3) `--describe-to` writes a JSON report into a pre-created nested directory.

## Relationships

- **`scenarios/accounts.ts`** — Imports `seedCredentials` to derive the expected account count and to assert that `--describe-to` output enumerates exactly those named accounts.
- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to locate the `tsx` binary (`node_modules/.bin/tsx`) and to set the child process `cwd`.

## Notes

- **Async spawn is load-bearing.** `spawnSync` would block Jest's event loop; Jest is what drains the shared `mongod`'s stdout pipe. A blocked loop means `mongod` fills its pipe, holds its logging latch, and the child deadlocks. See `docs/reference/tests.md`.
- **Subprocess, not import.** Importing `scenarios/apply.ts` executes a seed against whatever `process.argv`/`process.env` the Jest worker happens to have. A child process lets each test case control its own env.
- **`freshDbUri` uses `URL`, not concatenation.** The shared Mongo is a replica set, so its URI carries `?replicaSet=…`. Appending a db name via string concat silently merges into the query value instead of the path.
- **NODE_ENV test includes `''`.** An empty string simulates "unset" — `dotenv/config` would fill a truly absent variable from `.env`, but an explicitly empty one passes through, so the gate sees a falsy value.
- **Redis/RabbitMQ disabled per-run.** The `.env` file references docker-compose hostnames; leaving them enabled costs a real DNS failure per run with no functional benefit to these tests.
