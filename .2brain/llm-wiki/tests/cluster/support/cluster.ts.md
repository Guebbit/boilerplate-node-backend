---
source: tests/cluster/support/cluster.ts
sha256: 65a7958ce8343238de397423502143f98401135d6d3a2d0a7f92de3f99d7d87a
generated_at: 2026-09-23T19:51:18.815889+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/cluster.ts

## Purpose

Boots the production cluster entry point (`src/cluster.ts`) as a real child process that forks multiple workers listening on a shared TCP port. This exists because every other suite in the repo runs the app in a single process (supertest against a mounted Express app), which is structurally unable to catch bugs that only manifest across worker boundaries — e.g. a per-process counter that looks correct in isolation but is wrong cluster-wide.

## Key elements

- **`Cluster`** (interface) — the return shape of `startCluster`: a `port` and a `stop()` that tears down workers + DB.
- **`startCluster({ workers, env, bootTimeoutMs })`** — the main entry point. Creates an ephemeral Mongo under `tmp/test/cluster-mongo/<uuid>`, picks a free port, spawns `npx tsx src/cluster.ts` with `detached: true`, wires output capture, and returns a `Cluster` handle.
- **`freePort()`** — binds to port `0`, reads back the OS-assigned port, closes the probe. Avoids `EADDRINUSE` races between concurrent runs.
- **`waitForListening(port, timeoutMs)`** — polls TCP-connect until something accepts on the port. Proves at least one worker is up.
- **`waitForWorkers(workers, timeoutMs, countReady)`** — polls a live counter until *all* N workers have logged their ready marker. Needed because `waitForListening` alone lets a burst hit a still-single-worker cluster.
- **`WORKER_READY_MARKER`** (`'Server listening on port'`) — the log line `src/app.ts` emits after `.listen()` is acknowledged; the only per-worker ready signal observable from outside the process.
- **`capture(chunk)`** — accumulates stdout/stderr into a bounded ring (`MAX_CAPTURED_CHUNKS = 40`) and counts `WORKER_READY_MARKER` occurrences across chunk boundaries via a `readyTail` carry.
- **`signalGroup(signal)`** — sends a signal to the entire process group (`process.kill(-child.pid, …)`) so `npx → tsx → primary → workers` all die together, regardless of whether intermediate layers forward signals.
- **`stop()`** — sends SIGTERM to the group, waits for exit, then removes the ephemeral Mongo data directory.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — imported as `startEphemeralMongo`; provides the in-memory MongoDB instance the workers connect to over TCP.
- **`scenarios/support/ephemeral-mongod.ts`** — imported as `startInProcessMongod`; passed as the `startInProcess` implementation to `startEphemeralMongo`.
- **`tests/cluster/rate-limit.test.ts`** — primary consumer; its "gives each worker its own budget" case is cited in comments as the bug that motivated `waitForWorkers`.

## Notes

- `NODE_ENV` is set to `'development'`, **not** `'test'`, because `src/app.ts` skips `startServer()` entirely under `test`, which would leave forked workers mounted but never listening.
- `NODE_ENABLE_CLUSTERING=1` is required; without it the child is a single process and all cross-worker assertions pass for the wrong reason.
- `NODE_ENV=development` also activates `assertRequiredConfig`, so the env must supply `NODE_URL`, `NODE_TOKEN_*`, and the encryption keys explicitly (CI has no local `.env`).
- The `readyTail` is kept at `marker.length - 1` characters to prevent double-counting a marker that ends exactly on a chunk boundary.
- `detached: true` is essential: it puts the child at the head of a new process group so `-child.pid` reaches every descendant. Without it, `child.kill()` only signals `npx` and relies on each layer forwarding the signal.
- The Mongo data dir lives under the repo's `tmp/test/` (not `os.tmpdir()`) so it inherits the same ownership setup `global-setup.ts` establishes, keeping ~200 MB of ephemeral data out of a shared `/tmp`.
