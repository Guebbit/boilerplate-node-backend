# src/infrastructure/adapters/managed-connection.ts

## Purpose

A generic factory (`manageConnection`) that encapsulates the full lifecycle of one optional external dependency — memoised handle, deduplicated connect, warn-once latching, a fail-open getter, a health-status reader, and clean shutdown. It exists so that each adapter (Redis cache, RabbitMQ queue, rate-limit store) supplies only its own `connect`/`isReady`/`close` logic while sharing the six cross-cutting rules once.

## Key elements

- **`ManagedConnectionOptions<THandle>`** — the interface an adapter must fulfil: `isEnabled`, `connect`, `isReady`, `close`, `unavailableMessage`, plus optional `unavailableLevel` and `onRecovered`.
- **`ManagedConnection<THandle>`** — the lifecycle object returned to the adapter: `get()`, `getOrThrow()`, `state()`, `forget()`, `reportUnavailable()`, `stop()`.
- **`manageConnection<THandle>(options)`** — the single exported factory. Closes over module-level `handle`, `connectPromise`, and `warningLogged` state private to each call.
- **`NotConfigured`** (internal) — sentinel thrown when `connect()` resolves `undefined`; distinguishes "cannot be built" from a genuine failure (no warning is logged for it).
- **`attempt()`** (internal) — the one place a socket is actually opened; deduplicates concurrent callers via the shared `connectPromise`.

## Relationships

- **`cache.ts`** — calls `manageConnection` to manage the Redis handle; uses `get()` so a missing cache silently skips read-through/write-through.
- **`queue.ts`** — calls `manageConnection` for RabbitMQ; registers an error listener that invokes `forget()` to drop a dead channel, letting the next `get()` open a fresh one. Its `close` must tear down the underlying TCP connection, not just the channel.
- **`rate-limit-store.ts`** — the sole consumer of `getOrThrow()`, because rate limiting must fail closed rather than open.
- **`logger.ts`** — imported for the warn/error lines emitted by `reportUnavailable`.
- **`dependency-health.ts`** — provides the `DependencyStatus` type (`'disabled' | 'ready' | 'connecting' | 'unavailable'`) returned by `state()`.
- **`tests/unit/infrastructure/adapters/managed-connection.test.ts`** — unit tests exercising the factory in isolation.

## Notes

- **No timer-based retry.** Recovery is demand-driven: the next `get()` (or `getOrThrow()`) is the only thing that re-attempts a connection. A dead dependency that is never touched again stays dead until the next request.
- **`connect()` resolving `undefined` is not a failure.** It means the configuration could not produce a handle at all; no warning is logged and `warningLogged` is not set.
- **`get()` never rejects.** It resolves `undefined` for disabled, unconfigured, *and* unreachable states. Callers treat all three as "skip." `getOrThrow()` is the only path that rejects, and only the rate limiter uses it.
- **`forget()` does not close the handle.** It is for adapters whose handle self-announces death (e.g. a RabbitMQ channel `error` event). The adapter's own close path is responsible for releasing resources; `forget()` merely clears the memo so the next `get()` opens fresh.
- **`stop()` awaits an in-flight connect before calling `close`.** This prevents a socket that finishes opening after shutdown from becoming an orphan holding the process open.
- **`warningLogged` latch is shared with `reportUnavailable`.** Out-of-band failures (channel `error` events, mid-publish rejections) call `reportUnavailable` and share the same latch, so a dead dependency produces at most one log line per outage window regardless of how many operations fail.
