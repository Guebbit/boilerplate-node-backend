---
source: src/infrastructure/runtime/server-lifecycle.ts
source_sha256: 80d199b049898c3a2010af129c63f1fff491504af7b83e10e3958d20f935de9c
context_sha256: 0dac9ec10c92dfa49cbdc5fa34af0cf18730c92d95f15e933f4354fe6ca2fd3d
generated_at: 2026-11-22T03:07:32.559780+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/server-lifecycle.ts

## Purpose
Orchestrates graceful shutdown and failed-boot handling. It closes the HTTP server, then tears down infrastructure in a fixed order under a shared deadline, so a stuck teardown cannot hang the process. It only sequences the stop calls each adapter already exposes and does not know how any adapter stops.

## Key elements
- `listenOn(app, port, host?)`: wraps Express 5 `app.listen` in a promise. Express passes bind errors (EADDRINUSE, EACCES) to the same callback as success, so this rejects on error instead of reporting "listening" on a socket that never opened.
- `failBoot(error, stopFunction)`: logs the error, runs the teardown (ignoring its failure), then `process.exit(1)`. Exiting matters because a half-booted process stays alive on its open connections, and a restart policy only acts on a process that has exited.
- `SHUTDOWN_SHARES`: fractions of `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` given to each step: `drain` 0.3, `renders` 0.25, `inFlight` 0.1, `idempotency` 0.05, `queue` 0.2. They sum to 0.9, which leaves headroom for the cache, database and telemetry to close before the forced exit.
- `closeServer(server)`: promisified `server.close()`.
  - It ends SSE streams via `endSseStreams()` and closes idle keep-alive sockets immediately.
  - It cuts the remaining connections with `closeAllConnections()` after the `drain` share. That timer is `unref`'d.
- `shutdownInfra(server?, settleInFlight?)`: runs the teardown chain in order:
  1. Close the server, only if it is listening.
  2. `stopLocaleOverrideRefresh`.
  3. `settleRenders` (PDF).
  4. `settleIdempotencyMarks`.
  5. The caller's `settleInFlight(timeoutMs)`.
  6. `stopJobDrain`.
  7. `stopQueue`.
  8. `stopCache`.
  9. `stopPubSub`.
  10. `stopLimitsRedis`.
  11. `stopDatabase`.
  12. `shutdownAnalytics`.
  13. `shutdownTracing`.

  The server argument is optional so CLIs that boot without listening can use it. Each step is documented as swallowing its own failures.
- `createShutdownHandler(stopFunction)`: returns a signal listener.
  - The first signal runs the shutdown. Later signals are logged and ignored.
  - It calls `markServerDraining()`, so `/readyz` returns 503 and responses carry `Connection: close`.
  - It arms an `unref`'d forced-exit timer for `NODE_SHUTDOWN_DELAY_MS + NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`. When the timer fires it logs and calls `process.exit(1)`.
  - It fires `stopConsuming()` and `stopJobDrain(0)` without awaiting them.
  - It uses the `sleep` import from `node:timers/promises` for the lame-duck delay before teardown. The handler is not async because Node ignores a promise returned from a signal listener.

## Relationships
- Adapters `cache.ts`, `pubsub.ts`, `limits-redis.ts`, `job-drain.ts`, `queue.ts`, `pdf.ts` and `logger.ts` supply the stop and settle functions and the logger that this file calls.
- `src/infrastructure/http/middlewares/idempotency.ts` supplies `settleIdempotencyMarks`, so pending done-marks finish before the database closes.
- It also imports from the observability, otel-sdk, database, i18n, sse, config and readiness modules, which are not in the neighbor list.
- `src/app.ts`, `src/app/process-boot.ts` and `src/app/worker-process.ts` are the likely consumers, as the entry and boot code that wires `listenOn`, `failBoot`, `shutdownInfra` and `createShutdownHandler`. This is inferred from the neighbor list, since the visible code does not show the callers.
- The k8s manifests (`app.yaml`, `worker.yaml`, `worker-heavy.yaml`) are related through the orchestrator grace period. The file says the delay plus the teardown timeout must stay below it.

## Notes
- Keep `NODE_SHUTDOWN_DELAY_MS + NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` below the orchestrator's grace period. Otherwise the platform SIGKILLs the container mid-drain and the internal forced-exit timer never fires.
- The lame-duck delay lets the load balancer see the 503 and stop routing here before the listener closes.
- Ordering is deliberate:
  - The queue stops before the cache, so a running job cannot reopen the closed cache connection.
  - Renders settle before exit, so Chromium and its temporary profile are not orphaned.
  - Idempotency marks settle before the database closes, so a key is not stranded in flight.
  - Analytics and tracing close last so they capture the teardown.
- `stopConsuming()` is not awaited because the broker's cancel reply can stall for minutes. `stopQueue` cancels again later.
- `settleInFlight` is injected because infrastructure must not import the layers above it.
