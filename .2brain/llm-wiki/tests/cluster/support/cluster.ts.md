---
source: tests/cluster/support/cluster.ts
sha256: 62c1d80d0ab6cbdc9d1ee77c5a9580b8ee1913a2123f3f81ad8117a173d742a1
generated_at: 2026-10-29T06:38:03.988581+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/cluster.ts

## Purpose

Boots the real `src/cluster.ts` as a spawned child process with forked worker processes, a dedicated ephemeral MongoDB, and a dynamically allocated TCP port. It exists because every other test suite in the repo runs the app in a single process (supertest against a mounted Express app) and therefore cannot observe bugs that only manifest across workers—e.g. a per-process counter that looks correct to one worker but is wrong when summed across the cluster.

## Key elements

- **`Cluster`** (interface) — the return type of `startCluster`; exposes `port` and a `stop()` that tears down workers and the database.
- **`freePort()`** — binds a `net` server to port `0`, reads back the OS-assigned port, then closes it. Avoids `EADDRINUSE` collisions between concurrent test runs.
- **`waitForListening(port, timeoutMs)`** — polls TCP until something accepts connections on the given port. Proves at least one worker is up.
- **`waitForWorkers(workers, timeoutMs, countReady)`** — polls until the running ready-count reaches `workers`. Necessary because `waitForListening` alone can pass while only one of N workers has registered; a burst sent too early would land on a single worker and mimic the very per-process bug the suite targets.
- **`startCluster({ workers, env, bootTimeoutMs })`** — the main orchestrator. Creates a per-boot `dbPath` under `tmp/test/cluster-mongo/`, starts ephemeral Mongo, allocates a free port, spawns `npx tsx --import ./scenarios/support/development-doubles.ts src/cluster.ts` in a detached process group, captures stdout/stderr (bounded to 40 chunks) for failure diagnostics, and resolves with a `Cluster` once all workers report ready.
- **`WORKER_READY_MARKER`** (`'Server listening on port'`) — the log line `createApp()` emits per worker after `.listen()` is acknowledged; the only out-of-process "ready" signal available to this harness.
- **`capture()`** — accumulates output chunks, maintains a running `workersReady` counter, and keeps a `readyTail` (one character shorter than the marker) so a marker split across two `data` events is still counted exactly once.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — `startEphemeralMongo` is called to give the child cluster its own in-memory MongoDB (workers connect over TCP and cannot share the test process's mongoose instance).
- **`scenarios/support/ephemeral-mongod.ts`** — `startInProcessMongod` is passed as the `startInProcess` implementation to `startEphemeralMongo`.
- **`tests/support/eventually.ts`** — `retryUntil` is used by both `waitForListening` and `waitForWorkers` for bounded polling.
- **`tests/support/paths.ts`** — `REPO_ROOT` provides the base path for `cwd` in the spawn call and the `dbPath` under `tmp/test/`.
- **`tests/cluster/rate-limit.test.ts`** — the primary consumer; calls `startCluster` to get a multi-worker cluster, then fires concurrent requests over TCP to verify per-worker rate-limit budgets.
- **`src/infrastructure/adapters/logger.ts`** — the `WORKER_READY_MARKER` string originates from the logger output emitted by `createApp()` during worker boot; this file depends on that exact wording.

## Notes

- **`NODE_ENV` is set to `'development'`, not `'test'`.** Under `test`, `assertModuleConfig` in `src/kernel/module-config.ts` skips its presence checks. This suite intentionally wants those checks to run against the hard-coded env values (tokens, encryption keys, shop config), matching a fresh-checkout boot.
- **`NODE_ENABLE_CLUSTERING` must be `'1'`.** `NODE_CLUSTER_WORKERS` alone does nothing; without the gate the child is a single process and every cross-worker assertion passes for the wrong reason.
- **`stop()` signals the whole process group** (`detached: true` puts `npx` → `tsx` → primary → workers into one PGID). `child.kill()` alone would only reach `npx` and leave `tsx`, the primary, and all forked workers orphaned.
- **Output capture is bounded (40 chunks).** A late boot failure can produce thousands of lines; the useful error is always near the end. The `workersReady` counter is maintained independently of the trimmed `output` array so trimming cannot undercount ready markers.
- **`readyTail` is one character shorter than the marker.** This guarantees a marker that ends exactly on a chunk boundary cannot be counted twice, while a marker split across chunks is still detected.
