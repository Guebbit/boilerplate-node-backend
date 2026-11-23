---
source: src/infrastructure/adapters/managed-connection.ts
source_sha256: bb01dd9b3910866ee8e1cf54c9bc2a0d99cd7d43920ef6095f5ae4e3e36362b4
context_sha256: 4c6b960dbc232bf5b24f65a1138cdd51bea51e9b2e36d53882f118796d8109b7
generated_at: 2026-11-22T02:40:37.721825+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/managed-connection.ts

## Purpose
Defines the lifecycle for one optional Redis-style dependency, shared by the cache adapter and the rate-limit store. An unconfigured dependency is a supported deployment, and an unreachable one is a degraded deployment. Neither may turn a request into an error. The file centralises the memoised handle, the shared in-flight connect, a warn-once latch, a non-rejecting getter, a status reader and a close. Adapters supply only what is specific to them. It deliberately has no timer-based retry; recovery happens on demand, when the next `get()` is called.

## Key elements
- **`unavailabilityLatch(log)`**: builds a warn-once latch.
  - `report(error)` logs the first failure and stays quiet until `clear()`.
  - `clear()` resets the latch and returns whether it had been set, i.e. whether a warning was ever logged.
- **`DependencyStatus`**: `'ready' | 'connecting' | 'unavailable' | 'disabled'`, the four values used by `GET /observability/health`. `disabled` is not a failure.
- **`ManagedConnectionOptions<THandle>`**: what an adapter supplies.
  - `unavailableMessage`
  - `isEnabled`
  - `connect` (resolving `undefined` means "cannot be built")
  - `isReady`
  - `close` (receives the handle or `undefined`)
  - Optional `unavailableLevel` (`'warn'` by default, or `'error'`)
  - Optional `onRecovered`
- **`ManagedConnection<THandle>`**: the returned lifecycle.
  - `get()`: resolves the live handle or `undefined`, and never rejects.
  - `getOrThrow()`: rejects when the dependency is unreachable or disabled. It is for callers that must fail closed (the rate limiter).
  - `state()`: reports the status with no I/O.
  - `forget()`: drops the memoised handle without closing it.
  - `reportUnavailable(error)`: reports through the shared latch.
  - `stop()`: closes and resets state.
- **`manageConnection(options)`**: the factory. It holds a private `handle` and `connectPromise` per call.
  - `attempt()` deduplicates concurrent connects.
  - On success it stores the handle, clears the latch and calls `onRecovered` if a warning had been logged.
  - On failure it clears the handle and reports through the latch, except for the internal `NotConfigured` case.
  - `connectPromise` is cleared in `finally`, so the next call can retry.

## Relationships
- **`logger.ts`**: the only runtime import. The latch's log callback logs the unavailability message and error through the logger, at `warn` by default or `error` when `unavailableLevel` is `'error'`.
- **`cache.ts` and `limits-redis.ts`**: the two adapters this module was written for. The cache is fail-open and uses `get`. The rate limiter is the fail-closed caller of `getOrThrow`.
- **`queue.ts`**: does not use `manageConnection`, because amqplib's own `recovery` retries the connection and re-runs `setup`. It shares only `unavailabilityLatch`.
- **`pubsub.ts`**: a neighbour in the graph. The visible content shows no direct interaction.
- **`dependency-health.ts`**: consumes `DependencyStatus` and `state()` for `GET /observability/health`.
- **`managed-connection.test.ts`**: the unit tests for this module.

## Notes
- `get()` and `getOrThrow()` check `isEnabled()` first. A disabled dependency never opens a socket.
- `connect()` resolving `undefined` is treated as unavailable without a warning, via the internal `NotConfigured` error.
- `getOrThrow()` rejects with `NotConfigured` when the dependency is disabled.
- `isReady` is checked before every reuse, so a dead handle is reconnected rather than returned. An adapter whose handle reports its own death can call `forget()` from its close listener.
- `state()` reports `connecting` exactly while an attempt is in flight.
- `stop()` waits for an in-flight connect before calling `close`, and swallows close errors because shutdown must not raise. It then clears the handle, the in-flight promise and the latch.
- The warning-level branch is wrapped in `// Stryker disable all` / `// Stryker restore all` comments, which exclude it from mutation testing.
