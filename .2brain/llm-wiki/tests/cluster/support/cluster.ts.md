---
source: tests/cluster/support/cluster.ts
sha256: 4c2ecf77d3709fcefdebfa30099bffeca1b5b7fd7825d2057471efaeae33e721
generated_at: 2026-11-08T09:18:16.477495+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/cluster.ts

## Purpose

Boots the real cluster entry point (`src/cluster.ts`) as a spawned child process with genuine worker forks and a real TCP port, so that tests can observe cross-process state — the class of bug a single-process `supertest` setup structurally cannot reproduce. Every test in the `tests/cluster/` directory talks to a live multi-process cluster over sockets rather than mounting an Express app in-process.

## Key elements

- **`Cluster` (interface)** — the handle returned to tests: a shared `port` and a `stop()` that tears down workers and the ephemeral database.
- **`startCluster({ workers, env?, bootTimeoutMs? })`** — the main export. Creates a per-boot `tmp/test/cluster-mongo/<uuid>` dbPath, starts an in-process ephemeral Mongo, picks a free port, spawns `npx tsx --import …/development-doubles.ts src/cluster.ts` with a fully populated `NODE_*` env (clustering enabled, secrets inline), waits for every worker to report ready, then resolves with a `Cluster`. On failure, `stop()` signals the entire process group (`detached: true` → `process.kill(-pid)`) so no orphan workers survive.
- **`freePort()`** — binds to port `0`, reads back the OS-assigned port, closes the probe. Avoids `EADDRINUSE` races between concurrent CI jobs.
- **`waitForListening(port, timeoutMs)`** — TCP-connect retry loop (via `retryUntil`) that proves at least one worker accepts connections.
- **`waitForWorkers(workers, timeoutMs, countReady)`** — retries until the running `workersReady` counter (maintained by the `capture` function) reaches the expected count. Closes the gap where `waitForListening` alone would let a test burst into a still-single-worker cluster and misread the result.
- **`capture(chunk)`** — appends to a bounded ring of up to 40 chunks (`MAX_CAPTURED_CHUNKS`), counts `WORKER_READY_MARKER` ("Server listening on port") occurrences using a `readyTail` to handle markers split across `data` event boundaries, and increments the `workersReady` counter.
- **`WORKER_READY_MARKER`** — the exact log string `src/app.ts` emits after `listen()` is acknowledged; the only per-worker "ready" signal observable from outside the process.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — provides `startEphemeralMongo`, which boots the in-process `mongodb-memory-server` instance the cluster workers connect to over TCP.
- **`scenarios/support/ephemeral-mongod.ts`** — provides `startInProcessMongod`, passed as the `startInProcess` option so the Mongo runs in the same process as the test (not a separate binary), keeping teardown simple.
- **`tests/support/eventually.ts`** — provides `retryUntil`, the generic poll-until-success loop used by both `waitForListening` and `waitForWorkers`.
- **`tests/support/paths.ts`** — provides `REPO_ROOT`, used to resolve the child's `cwd`, the Mongo `dbPath`, and the preload script path.
- **`tests/cluster/rate-limit.test.ts`** — the primary consumer; calls `startCluster({ workers: N })`, fires HTTP requests over the shared port to verify per-worker budget isolation, then calls `cluster.stop()`.

## Notes

- **`NODE_ENV` is `'development'`, not `'test'`.** This is deliberate: `assertModuleConfig` (`src/kernel/module-config.ts`) skips its required-secret checks under `test`, but this suite wants them exercised for real. Consequently every required secret and shop-identity variable must be supplied inline in the spawn env; CI has no `.env` to fall back on.
- **`NODE_ENABLE_CLUSTERING` must be `'1'`.** Setting `NODE_CLUSTER_WORKERS` alone does nothing; without the gate the child is a single process and every cross-worker assertion passes for the wrong reason.
- **Output capture is chunk-bounded, not line-bounded.** A chunk boundary is wherever the OS splits the stream; splitting on lines would be incorrect. The 40-chunk window keeps a jest failure message readable while still capturing the tail where the actual error lives.
- **`readyTail` holds `marker.length − 1` characters.** This is the exact invariant that prevents a marker ending flush at a chunk boundary from being counted twice, while still catching one split across two `data` events.
- **The child is in its own process group (`detached: true`).** `child.kill()` only reaches `npx`; the cluster primary and its forked workers are grandchildren. Teardown must signal the whole PGID (`-pid`) or workers leak.
