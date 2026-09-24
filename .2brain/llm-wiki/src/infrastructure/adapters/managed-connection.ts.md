---
source: src/infrastructure/adapters/managed-connection.ts
sha256: dfdbfafb037c4e6055e000e848639a4861cf0849b64d8372c58b5e2718e52971
generated_at: 2026-09-23T17:41:03.891694+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/managed-connection.ts

## Purpose

Centralises the shared lifecycle of an optional external dependency (Redis, RabbitMQ channel): a single memoised handle, thunder-herd-free connect, warn-once outage logging, fail-open retrieval, health reporting, and clean shutdown. Adapters like the cache and rate-limit store supply only their own `connect`/`isReady`/`close` logic; the connect-reuse-latch-status-close rules live here once.

## Key elements

- **`unavailabilityLatch(log)`** — Returns `{ report, clear }`. `report` logs the first failure in a run; `clear` resets and returns whether a warning was previously logged (used to gate a recovery announcement).
- **`DependencyStatus`** — Union type `'ready' | 'connecting' | 'unavailable' | 'disabled'`, consumed by the health endpoint.
- **`ManagedConnectionOptions<THandle>`** — Interface an adapter implements: `unavailableMessage`, `isEnabled()`, `connect()`, `isReady(handle)`, `close(handle)`, plus optional `unavailableLevel` and `onRecovered`.
- **`ManagedConnection<THandle>`** — Interface returned by the factory: `get()` (fail-open), `getOrThrow()` (fail-closed), `state()`, `forget()`, `reportUnavailable()`, `stop()`.
- **`manageConnection(options)`** — Factory that wires the options into a single-connection lifecycle with an in-flight `connectPromise` deduplicator and a private `NotConfigured` sentinel (a `connect()` resolving `undefined` is treated as "not configured", not a failure).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imported; the only external dependency. Used to emit the warn/error log inside the latch callback.
- **`src/infrastructure/adapters/cache.ts`** — Calls `manageConnection` to get a fail-open Redis handle for cache reads/writes and `clearCache`.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Consumes the `getOrThrow()` path, the sole caller that requires fail-closed behaviour (rejects instead of resolving `undefined`).
- **`src/infrastructure/adapters/queue.ts`** — Uses only `unavailabilityLatch` (shared warn-once logging); does **not** use `manageConnection` because amqplib's built-in recovery has no equivalent "attempt" seam.
- **`src/modules/observability/services/dependency-health.ts`** — Reads `state()` to populate `GET /observability/health` without performing I/O.
- **`tests/unit/infrastructure/adapters/managed-connection.test.ts`** — Unit tests covering the latch, connect deduplication, fail-open/fail-closed paths, `stop()` ordering, and `state()` transitions.

## Notes

- **No timer-based retry.** Recovery is demand-driven: the next `get()` call re-attempts. A stale handle is detected via `isReady` and replaced lazily.
- **`connect()` resolving `undefined`** is a distinct code path from rejecting: it means "configuration could not be built" and suppresses the warning latch entirely.
- **`get()` never rejects.** All three "unavailable" sub-states (disabled, unconfigured, unreachable) resolve to `undefined`. Only `getOrThrow` rejects.
- **`stop()` is the only path that may suppress a rejection** (`.catch(() => undefined)`), because an already-dead socket rejecting its own close during shutdown is the ordinary case.
- **`forget()` does not close the handle.** It exists for adapters (e.g. `queue.ts`) whose handle emits a `close`/`error` event; the adapter calls `forget()` from that listener so the next `get()` opens a fresh connection.
- **`onRecovered` fires only if the latch was actually set** (i.e. a warning was logged), avoiding a "recovered" log line for a dependency that never went down.
