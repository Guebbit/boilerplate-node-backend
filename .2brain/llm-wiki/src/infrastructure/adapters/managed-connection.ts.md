---
source: src/infrastructure/adapters/managed-connection.ts
sha256: 79f884caedd836ceb4a89ac794af1d9d0c0ed1f0ee0902e2d8bb0f65d9ba4495
generated_at: 2026-09-27T14:07:21.573227+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/managed-connection.ts

## Purpose

Centralises the lifecycle of a single optional external dependency (Redis, etc.): connection memoisation, shared in-flight connect, warn-once outage logging, a fail-open getter, a `DependencyStatus` reader, and a safe shutdown. Exists so that `cache.ts` and `rate-limit-store.ts` stop duplicating six pieces of identical boilerplate and instead supply only what is genuinely their own (the connect/check/close calls and the human-readable outage message).

## Key elements

- **`unavailabilityLatch(log)`** – Returns `{ report, clear }`. `report` logs the first error in a run and stays silent thereafter; `clear` resets and returns whether a warning was ever logged (so callers can decide whether a recovery is worth announcing). Shared by `queue.ts` as well.
- **`DependencyStatus`** – Union type `'ready' | 'connecting' | 'unavailable' | 'disabled'`. The four values consumed by `GET /observability/health`.
- **`ManagedConnectionOptions<THandle>`** – The contract an adapter supplies: `unavailableMessage`, `isEnabled`, `connect`, `isReady`, `close`, plus optional `unavailableLevel` and `onRecovered`.
- **`ManagedConnection<THandle>`** – The lifecycle surface returned by the factory: `get`, `getOrThrow`, `state`, `forget`, `reportUnavailable`, `stop`.
- **`manageConnection(options)`** – The factory. Owns the memoised handle, the shared `connectPromise`, the latch, and an internal `NotConfigured` sentinel. Returns a `ManagedConnection` instance closed over private module-level state.

## Relationships

- **`cache.ts`** – Calls `manageConnection` to get its Redis handle lifecycle; supplies `connect`, `isReady`, `close`, and its own outage message.
- **`rate-limit-store.ts`** – Calls `manageConnection` as well, but uses `getOrThrow` (fail-closed) instead of `get` (fail-open) because a rate limiter that silently skips defeats its purpose.
- **`logger.ts`** – Imported; the latch's `log` callback routes through `logger.warn` or `logger.error` depending on the `unavailableLevel` option.
- **`queue.ts`** – Does **not** call `manageConnection` (amqplib's built-in `recovery` replaces the reconnect logic). Imports only `unavailabilityLatch` to share the warn-once pattern for RabbitMQ outages.
- **`dependency-health.ts`** – Reads `state()` / `DependencyStatus` to populate the observability health endpoint.
- **`tests/unit/infrastructure/adapters/managed-connection.test.ts`** – Unit-tests the factory, latch, and edge cases (disabled, not-configured, thundering-herd, shutdown ordering).

## Notes

- **`get` never rejects.** A failed or missing connection resolves to `undefined`. The only path that rejects is `getOrThrow`, used exclusively by the rate limiter.
- **`connect()` resolving `undefined` ≠ failure.** It means "cannot be built at all" (configuration that `isEnabled` couldn't rule out). It is treated as unavailable *without* tripping the latch, because nothing actually broke.
- **No timer-based retry.** Recovery is purely demand-driven: the next `get()` call re-attempts. The `isReady` check before reuse is what detects a handle that died since the last call.
- **`forget()` drops the handle without closing it.** Intended for adapters whose handle announces its own death (e.g. a `close` event listener calls `forget`, then the next `get` opens a fresh handle). Do not confuse with `stop()`.
- **`stop()` swallows all errors.** Shutdown must never raise; a dead socket rejecting its own close is the expected case.
- **Stryker markers** wrap the log-level branch (`warn` vs `error`) to exclude it from mutation testing.
