---
source: tests/integration/scenarios/apply.test.ts
sha256: 5c5316e7004fde6d7b0a63b82570fe9da3d6b5557a3db26a7cfda5696cd4233f
generated_at: 2026-09-27T15:58:07.223755+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/apply.test.ts

## Purpose

Integration tests that exercise the gate logic in `scenarios/apply.ts` — the production refusal, the non-empty-database refusal, and `--reset`. The target is spawned as a real subprocess (via `tsx`) against a fresh database on the shared test Mongo server, ensuring the actual CLI entry point is tested rather than an in-process import.

## Key elements

- **`runApply(args, dbUri, nodeEnv?)`** — Spawns `scenarios/apply.ts` through `execFile` with `tsx`, Redis/RabbitMQ disabled, and a per-call `NODE_DB_URI`. Resolves with `{ status, stdout, stderr }`.
- **`ApplyResult`** (interface) — Shape returned by `runApply`: exit code (or `null` for signal-killed), accumulated stdout, accumulated stderr.
- **`freshDbUri()`** — Builds a unique database URI on the shared test Mongo by setting `uri.pathname` on a parsed `URL`, avoiding query-string corruption from replica-set parameters.
- **`NAMED_ACCOUNT_COUNT`** — `Object.keys(seedCredentials).length`; the expected user count after a `blank` seed.
- **`TSX_BIN`** — Absolute path to `node_modules/.bin/tsx` under the repo root.
- **`APPLY_TIMEOUT_MS`** (30 s) — Timeout per `it` block; the second test uses `×3` because it runs three sequential applies.
- **Test 1: production refusal** — Runs with `NODE_ENV=production`, expects exit 0, a "NODE_ENV is production" message, and an empty database (no connection ever opened).
- **Test 2: seed → refuse → `--reset`** — Seeds `blank`, re-runs against the same non-empty DB (expects refusal), then re-runs with `--reset` (expects reseed to the same count).

## Relationships

- **`scenarios/accounts.ts`** — Imports `seedCredentials` solely to derive `NAMED_ACCOUNT_COUNT` (the number of named users a `blank` seed creates).
- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to resolve the `tsx` binary path and set the subprocess `cwd`.

## Notes

- **Async spawn is load-bearing.** Using `spawnSync` blocks Jest's event loop for the entire run; Jest is the only consumer of the shared `mongod`'s stdout pipe. A blocked pipe causes `mongod` to hang mid-log-line while building indexes, deadlocking the child.
- **Subprocess, not import.** Importing `scenarios/apply.ts` seeds on import against whatever `process.argv`/`process.env` happen to exist in the Jest worker. Spawning gives per-case control over both.
- **`URL` parsing for the DB path.** The shared Mongo URI carries `?replicaSet=…`; naive string concatenation of a DB name appends it to the query value rather than the path, silently producing a garbage URI.
- **Redis/RabbitMQ forced off.** Without this, the loaded `.env` points at docker-compose hostnames, causing a real DNS timeout per run.
- **`execFile` callback error is intentionally swallowed.** A non-zero exit is a case under test; the `close` event carries the status the assertions read.
