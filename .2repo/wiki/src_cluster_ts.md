# src/cluster.ts

## Purpose
Entry-point wrapper (set as `"main"` in `package.json`) that either runs the app under Node's `cluster` module with crash-recovery and coordinated shutdown logic, or falls back to directly loading `app.ts` when clustering is disabled. It also ensures OpenTelemetry tracing is initialized before any other module is evaluated.

## Key elements
- **`startTracing()` call** — Must execute before all other imports so spans cover the entire process lifetime.
- **`CLUSTER_ENABLED`** — Read from `NODE_ENABLE_CLUSTERING` (default `false`); gates the entire primary/worker split.
- **`getWorkerTarget()`** — Resolves worker count from `NODE_CLUSTER_WORKERS` (default `os.cpus().length`), clamping to a minimum of 1.
- **Primary process block** (`cluster.isPrimary && CLUSTER_ENABLED`):
  - `forkWorker` / `scheduleRespawn` — Spawns a worker; respawn is gated by a sliding-window crash counter with exponential backoff (base `NODE_CLUSTER_CRASH_BACKOFF_BASE_MS`, cap `NODE_CLUSTER_CRASH_BACKOFF_MAX_MS`).
  - `shouldRespawn` — Skips respawn on clean exit (code 0), `SIGTERM`/`SIGINT`, or post-disconnect exits.
  - `startPrimaryShutdown` — Sends `SIGTERM` to all workers, then escalates to `SIGKILL` after `NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS` (default 15 s).
- **Worker branch** (`else`) — Dynamically `import('./app')` so each worker runs the actual application.

## Relationships
- **`src/infrastructure/runtime/otel-sdk.ts`** — `startTracing()` is called on the first line of the module, before any other import, to guarantee trace coverage.
- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentFlag` and `environmentNumber` used to read all cluster tuning knobs from the environment.
- **`src/infrastructure/adapters/logger.ts`** — All informational and warning messages (fork, exit, backoff, shutdown) go through the shared `logger`.
- **`src/app.ts`** — Dynamically imported in the worker branch; this is the module each cluster worker actually executes.
- **`docs/tools/cluster-testing.md`** — Operational runbook for exercising the primary/worker lifecycle described here.

## Notes
- Switching off clustering is as simple as removing this file from `"main"` (or setting `NODE_ENABLE_CLUSTERING=false`); the app then runs as a single process via `app.ts`.
- The crash-window array (`crashHistory`) is in-memory only; a primary restart resets the backoff state.
- `timer.unref()` on both respawn and force-shutdown timers keeps the event loop from staying alive solely because of a pending respawn.
- `exitedAfterDisconnect` is checked before the exit code, so a worker that crashed and was already disconnected by the primary will not trigger another respawn.
