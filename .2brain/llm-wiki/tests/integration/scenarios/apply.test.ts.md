---
source: tests/integration/scenarios/apply.test.ts
sha256: c2f69177e432eb95efd8dbb38e4863f31af344c95db911013751d03c3f78806d
generated_at: 2026-10-15T12:52:36.794020+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/apply.test.ts

## Purpose

Integration test suite for the `scenarios/apply.ts` CLI. Verifies the three runtime gates (env refusal, non-empty-database refusal, `--reset` reseed) and the `--describe-to` JSON writer by spawning the real script as a child process against a fresh database on the shared test Mongo server.

## Key elements

- **`runApply(args, dbUri, nodeEnv?)`** — Spawns `tsx scenarios/apply.ts <args>` via `execFile` with a controlled `env` (forces Redis/RabbitMQ off, sets `NODE_DB_URI`). Resolves with an `ApplyResult` on the `close` event; the `error` callback is intentionally a no-op so non-zero exits are assertable rather than thrown.
- **`ApplyResult`** — `{ status: number | null; stdout: string; stderr: string }`. `status` is `null` when killed by a signal.
- **`freshDbUri()`** — Parses the shared `NODE_TEST_MONGO_URI` with `URL` and overwrites `pathname` with `/apply-<8-char uuid>`, yielding a unique database name that coexists with the replica-set query string.
- **`NAMED_ACCOUNT_COUNT`** — `Object.keys(seedCredentials).length`; the expected user count after a `blank` seed.
- **`TSX_BIN` / `APPLY_TIMEOUT_MS`** — Resolved path to `node_modules/.bin/tsx`; 30 s per-invocation timeout.
- **Test 1** (`it.each`) — Expects exit 1 and "not development or test" for `NODE_ENV` of `production`, `staging`, and `''` (empty simulates "unset" since `dotenv/config` would otherwise fill it). Also asserts the target DB is still empty.
- **Test 2** — Seeds, re-runs without `--reset` (expects "already holds data"), then runs with `--reset` (expects "Database emptied" and same user count, not double).
- **Test 3** — Passes `--describe-to=<tmp>/reports/e2e/scenario.json` (a not-yet-existing directory) and validates the JSON has `scenario: "blank"` and an `accounts` map matching `seedCredentials` keys.

## Relationships

- **`scenarios/accounts.ts`** (`@scenarios/accounts`) — Exports `seedCredentials`, the map of named test accounts. This suite uses it to compute the expected user count and to assert the `--describe-to` output contains exactly those keys.
- **`tests/support/paths.ts`** (`@tests/paths`) — Exports `REPO_ROOT`, used to resolve `TSX_BIN` and to set the child process `cwd`.

## Notes

- **Async spawn is load-bearing.** `spawnSync` blocks jest's event loop; jest is what drains the shared `mongod`'s stdout pipe. A full `spawnSync` call would deadlock `mongod` mid-log-line (pipe fills → `mongod` blocks on write → its listener stops accepting → child waits forever). See `docs/reference/tests.md`.
- **Subprocess, not import.** Importing `scenarios/apply.ts` executes the seed against whatever `process.argv`/`process.env` the shared jest worker happens to have. Spawning isolates the process and exercises the actual CLI entry point (`npm run scenario:apply` is itself a subprocess).
- **`freshDbUri` uses `URL`, not concatenation.** The shared server is a replica set, so the URI carries `?replicaSet=…`. Appending a db name to the *end* would fold into the query value; `URL.pathname` is the only safe slot.
- **Redis & RabbitMQ forced off** (`NODE_REDIS_CACHE_ENABLED=0`, `NODE_RABBITMQ_ENABLED=0`) to avoid real DNS failures against docker-compose hostnames that aren't running in this context.
- **Empty string in `it.each`** is not "no `NODE_ENV`"; it is the sentinel that tells `dotenv/config` to leave the variable absent so the script's own guard fires.
