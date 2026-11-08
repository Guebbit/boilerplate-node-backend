---
source: src/infrastructure/adapters/managed-connection.ts
sha256: 79f884caedd836ceb4a89ac794af1d9d0c0ed1f0ee0902e2d8bb0f65d9ba4495
generated_at: 2026-11-08T03:21:59.008705+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/managed-connection.ts

## Purpose

Centralises the lifecycle of a single optional dependency connection (Redis for cache, Redis for rate-limiting) so that both adapters share identical fail-open rules: unconfigured is a supported deployment, unreachable is degraded but not an error. The module owns the memoised handle, shared in-flight connect, warn-once latch, fail-open/fail-closed getters, health-status reader, and shutdown logic; each adapter supplies only its own `connect`, `isReady`, `close`, and `isEnabled`.

## Key elements

- **`unavailabilityLatch(log)`** — returns a `{ report, clear }` latch. `report` logs the first failure in a run of failures; `clear` resets and returns whether a warning was ever emitted (used to decide if recovery is worth announcing).
- **`DependencyStatus`** — `'ready' | 'connecting' | 'unavailable' | 'disabled'`. The four states exposed by `GET /observability/health`. `disabled` is not a failure.
- **`ManagedConnectionOptions<THandle>`** — the contract an adapter fulfils: `isEnabled`, `connect`, `isReady`, `close`, `unavailableMessage`, plus optional `unavailableLevel` and `onRecovered`.
- **`ManagedConnection<THandle>`** — the lifecycle surface: `get` (fail-open), `getOrThrow` (fail-closed, for the rate limiter), `state`, `forget`, `reportUnavailable`, `stop`.
- **`manageConnection<THandle>(options)`** — the factory. Closes over a single `handle`, a `connectPromise` (thunder-herd guard), and a latch instance. Returns the `ManagedConnection` object.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imports `logger`; the latch's log callback calls `logger.warn` or `logger.error` depending on `unavailableLevel`.
- **`src/infrastructure/adapters/cache.ts`** — primary consumer of `manageConnection`; uses the fail-open `get()` and `forget()` for its connection lifecycle.
- **`src/infrastructure/adapters/limits-redis.ts`** — consumer of `manageConnection` via `getOrThrow()` (the one fail-closed caller).
- **`src/infrastructure/adapters/queue.ts`** — does **not** use `manageConnection` (amqplib has its own reconnect); shares only `unavailabilityLatch` for warn-once logging of publish failures.
- **`src/modules/observability/services/dependency-health.ts`** — reads `state()` / `DependencyStatus` to populate the health endpoint.
- **`tests/unit/infrastructure/adapters/managed-connection.test.ts`** — unit tests for the module.

## Notes

- **No timer-based retry.** Recovery is purely demand-driven: the next `get()` or `getOrThrow()` call triggers a fresh `attempt()`. There is no background reconnect loop.
- **`connect()` resolving `undefined` ≠ rejecting.** A resolved `undefined` means "cannot be built" (a configuration gap `isEnabled` couldn't rule out) and is treated as unavailable *without* a warning. A rejection is a runtime failure and does trigger the latch.
- **`stop()` is the only path that must not raise.** It awaits an in-flight connect before calling `close`, then swallows any close rejection (the process is exiting; a dead socket rejecting its own close is the normal case).
- **`forget()` does not close.** It merely drops the memoised handle. Used by adapters that detect their own death (e.g. a channel close event) and need the next `get()` to open a fresh connection.
- **`state()` performs no I/O.** It reads in-memory state (`handle`, `connectPromise`, `isEnabled()`) only, so it is safe to call on every health-check tick.
- Stryker mutation suppression wraps the `unavailableLevel` branch — the two log-level paths are intentionally not mutation-tested.
