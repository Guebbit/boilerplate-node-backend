---
source: tests/integration/scenarios/apply.test.ts
sha256: c56249dc3cfa928d176d15604352f6666d2aab1466e5405e591ec8dd86d9d036
generated_at: 2026-09-23T20:06:19.716639+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/apply.test.ts

## Purpose

Integration test for `scenarios/apply.ts`. It exercises three gates — production-env refusal, non-empty-database refusal, and `--reset` — by spawning the real CLI entry point as an asynchronous subprocess against a fresh database on the shared test Mongo instance.

## Key elements

- **`runApply(args, dbUri, nodeEnv)`** — Spawns `tsx scenarios/apply.ts` via `execFile` with a controlled env (Redis/RabbitMQ disabled, explicit `NODE_DB_URI`). Resolves an `ApplyResult` on the `close` event; the `execFile` callback error is intentionally ignored because non-zero exits are assertions under test.
- **`ApplyResult`** — `{ status: number | null, stdout: string, stderr: string }`; the shape `runApply` resolves to.
- **`freshDbUri()`** — Builds a unique `apply-<uuid8>` database name on the shared `NODE_TEST_MONGO_URI`, guaranteeing each test case starts clean.
- **`NAMED_ACCOUNT_COUNT`** — `Object.keys(seedCredentials).length`; the exact user count a `blank` seed must produce.
- **`APPLY_TIMEOUT_MS`** (30 s) — Per-test jest timeout; the multi-step test uses `APPLY_TIMEOUT_MS * 3`.
- **Test 1: "refuses to run in production"** — Runs with `NODE_ENV=production`, asserts exit 0 + the refusal message, then confirms zero collections were created.
- **Test 2: "seeds an empty database, refuses a non-empty one, then reseeds after --reset"** — Three sequential `runApply` calls against the *same* fresh DB: blank seed → duplicate refusal → `--reset` reseed; asserts user count stays at `NAMED_ACCOUNT_COUNT` throughout.

## Relationships

- **`scenarios/accounts.ts`** — Imports `seedCredentials` solely to derive `NAMED_ACCOUNT_COUNT` (the number of users a `blank` seed is expected to create).

## Notes

- **Async spawn is load-bearing.** `spawnSync` would block jest's event loop; jest is what drains the shared `mongod`'s stdout pipe. Blocking it causes `mongod` to stall mid-log-line while the child waits on index-building responses. See `docs/reference/tests.md` for the full failure chain.
- **Subprocess, not import.** Importing `scenarios/apply.ts` seeds on import against whatever `process.argv`/`process.env` exist in the jest worker, which defeats per-case control. The subprocess also exercises the real `npm run scenario:apply` path.
- **Redis and RabbitMQ are forced off** (`NODE_REDIS_CACHE_ENABLED=0`, `NODE_RABBITMQ_ENABLED=0`) to avoid real DNS failures against docker-compose hostnames that aren't running in the test environment.
- **`close` event, not callback, carries the exit status.** The `execFile` callback receives an `Error` on non-zero exit but is set to `() => undefined`; the test reads `status` from the `close` event instead.
