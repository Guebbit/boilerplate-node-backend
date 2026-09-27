---
source: tests/cluster/support/cluster.ts
sha256: 58ffe0a02d2956de0a0ef1bdff8cadc085f7c4bd2629bfed5a0182d75a3a340a
generated_at: 2026-09-27T15:47:36.784244+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/cluster.ts

## Purpose

Boots the real `src/cluster.ts` as a child process with forked workers listening on a live TCP port, providing a black-box harness for tests that must observe cross-worker state (e.g. per-process counters) that a single-process supertest structurally cannot see.

## Key elements

- **`Cluster`** (interface, exported) — the handle returned by `startCluster`; exposes `port` and `stop()`.
- **`startCluster({ workers, env?, bootTimeoutMs? })`** — the main boot function. Spawns `npx tsx src/cluster.ts` in a detached process group, wires up an in-memory Mongo, a free port, and all required env vars, then waits for every worker to report ready before resolving a `Cluster`.
- **`freePort()`** — binds to port `0`, reads back the OS-assigned number, closes the probe. Avoids `EADDRINUSE` races between concurrent test runs.
- **`waitForListening(port, timeoutMs)`** — polls TCP connects to `127.0.0.1:port` until something accepts. Proves at least one worker is up.
- **`waitForWorkers(workers, timeoutMs, countReady)`** — polls a live counter until all N workers have emitted the ready marker. Necessary because `waitForListening` alone can fire while only one worker is registered, masking per-worker state bugs.
- **`WORKER_READY_MARKER`** (`'Server listening on port'`) — the log line counted per worker.
- **`capture(chunk)`** (internal) — appends to a bounded output buffer, increments a running `workersReady` total, and maintains a `readyTail` so the marker is not missed when split across two `data` events.
- **`signalGroup(signal)`** (internal) — sends a signal to the entire process group via `process.kill(-child.pid, …)` so the cascade reaches `npx → tsx → primary → workers` regardless of whether each layer forwards SIGTERM.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — imports `startEphemeralMongo` to provision the in-memory Mongo instance the workers connect over TCP.
- **`scenarios/support/ephemeral-mongod.ts`** — imports `startInProcessMongod`, passed as the `startInProcess` strategy to `startEphemeralMongo`.
- **`tests/support/paths.ts`** — imports `REPO_ROOT` for `cwd`, the `dbPath` location, and the spawned process's working directory.
- **`tests/cluster/rate-limit.test.ts`** — a direct consumer; its "gives each worker its own budget" case is the motivating example cited in `waitForWorkers`'s docblock for why waiting on all workers (not just one listener) is required.

## Notes

- **`NODE_ENV` is `'development'`, not `'test'`.** This forces `assertRequiredConfig` (`kernel/required-config.ts`) to run its full check, so the child must be supplied with every required secret explicitly (token keys, encryption keys, `NODE_URL`). A local `.env` would cover a dev machine; CI does not, hence the inline values.
- **`NODE_ENABLE_CLUSTERING` must be `'1'`.** Setting `NODE_CLUSTER_WORKERS` alone is a no-op; without the enable flag the child is a single process and every cross-worker assertion passes for the wrong reason.
- **`detached: true` + negative-PID kill.** The child is `npx`, not the cluster primary. `child.kill()` only reaches `npx`. The detached group flag makes `-child.pid` address every descendant in one signal.
- **`workersReady` is a running total, not derived from the `output` array.** The array is trimmed to `MAX_CAPTURED_CHUNKS` (40); a derived count would silently undercount once early boot chatter pushes a ready line out of the window.
- **`readyTail` holds `marker.length - 1` characters.** This is the maximum a split marker can leave behind, guaranteeing a whole marker that ended exactly on a chunk boundary is never counted twice.
- **`dbPath` lives under `REPO_ROOT/tmp/test/cluster-mongo/<uuid>`.** Without this, `mongodb-memory-server` falls back to `os.tmpdir()`, escaping the ownership guarantees `tests/support/global-setup.ts` establishes and dumping ~200 MB into a shared `/tmp`.
