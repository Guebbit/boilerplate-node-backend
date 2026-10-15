---
source: tests/cluster/support/cluster.ts
sha256: 4de43e6183ad9acece015f1d5a7059fb6eab5ad2c0c1b9b12ec109b9158df555
generated_at: 2026-10-15T12:31:34.719461+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/cluster.ts

## Purpose

Boots the production entrypoint (`src/cluster.ts`) as a real multi-process child, so tests can observe cross-worker state that a single-process (supertest) setup structurally cannot. The classic blind spot: a per-process counter looks perfect in isolation but is wrong once requests are spread across N workers. This harness forks the cluster, waits until every worker has reported ready, and exposes a shared port for TCP-level assertions.

## Key elements

- **`Cluster` (interface)** — the handle returned to tests: `{ port, stop }`. `stop()` kills the whole process group and tears down the ephemeral Mongo.
- **`startCluster({ workers, env, bootTimeoutMs })`** — the public entry point. Provisions a per-boot `dbPath` under `tmp/test/cluster-mongo/<uuid>/`, starts an ephemeral Mongo, grabs a free port, spawns `npx tsx --import ./scenarios/support/development-doubles.ts src/cluster.ts` with `detached: true`, captures output, waits for readiness, and resolves a `Cluster`.
- **`freePort()`** — binds to port `0`, reads back the OS-assigned port, then closes the probe. Avoids `EADDRINUSE` races between parallel runs.
- **`waitForListening(port, timeoutMs)`** — polls with TCP connects until *some* worker accepts. Sufficient to prove the primary is up, but **not** that all workers are.
- **`waitForWorkers(workers, timeoutMs, countReady)`** — polls a running counter until `workers` occurrences of `WORKER_READY_MARKER` have been seen in child output. Closes the gap where the primary dispatches before every worker has finished forking.
- **`WORKER_READY_MARKER`** (`'Server listening on port'`) — the per-worker log line emitted by `src/app.ts` after `.listen()` is acknowledged. The only externally observable "ready" signal.
- **`capture(chunk)`** — appends to a bounded `output` ring (last 40 chunks) and updates `workersReady` / `readyTail` to detect the marker even when it is split across two `data` events.
- **`MAX_CAPTURED_CHUNKS`** (40) — caps how much child output is retained for the failure message, so a late-boot failure doesn't dump thousands of lines into the Jest error.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — `startEphemeralMongo` is called to provision the per-boot in-memory Mongo the child connects to over TCP.
- **`scenarios/support/ephemeral-mongod.ts`** — `startInProcessMongod` is passed as the `startInProcess` strategy to `startEphemeralMongo`.
- **`tests/support/paths.ts`** — provides `REPO_ROOT`, used for `cwd`, the `dbPath` join, and the preload import path.
- **`tests/cluster/rate-limit.test.ts`** — primary consumer; its "gives each worker its own budget" case was the motivating bug that exposed the `waitForListening`-alone race (see `waitForWorkers` docblock).
- **`src/infrastructure/adapters/logger.ts`** — the logger whose `'Server listening on port'` output line is the `WORKER_READY_MARKER` this file counts.

## Notes

- **`NODE_ENV` is `'development'`, not `'test'`.** This is deliberate: `assertModuleConfig` skips its presence checks under `test`, and this suite wants them enforced. All required secrets (`NODE_TOKEN_*`, `NODE_*_ENCRYPTION_KEY`, shop identity, VAT rates) are inlined in the `env` block.
- **`NODE_ENABLE_CLUSTERING` must be `'1'`.** Setting only `NODE_CLUSTER_WORKERS` does nothing; without this flag the child is a single process and every cross-worker assertion passes for the wrong reason.
- **`detached: true` is load-bearing.** It creates a new process group (PGID = this PID) so `stop()` can signal the *entire* group—`npx`, the `tsx` runner, the primary, and every forked worker—rather than orphaning the workers two levels down.
- **`readyTail` holds `marker.length − 1` characters.** This is the exact size that prevents double-counting a marker ending on a chunk boundary while still catching one split across two events.
- **`dbPath` is under the repo's `tmp/test/`**, not `os.tmpdir()`. Leaving it unset would let `mongodb-memory-server` fall back to a shared `/tmp`, bypassing the ownership guarantees `global-setup.ts` establishes (~200 MB per boot would land in a shared directory).
- **The child's stdin is `'ignore'`.** No interactive input; all configuration arrives via `env`.
