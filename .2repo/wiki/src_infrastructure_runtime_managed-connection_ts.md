# src/infrastructure/runtime/managed-connection.ts

## Purpose

Centralises the lifecycle of an *optional* external dependency (Redis, RabbitMQ) so that unconfigured, unreachable, or in-flight states are all handled by one shared rule set. Adapters supply only three operations — open, check-alive, close — and receive a uniform `get()`/`state()`/`stop()` surface that never rejects, enabling every caller to treat a missing handle as "skip this step" rather than a request failure.

## Key elements

- **`ManagedConnectionOptions<THandle>`** — The adapter contract: `isEnabled`, `connect`, `isReady`, `close`, and the adapter-specific `unavailableMessage` used in the warn-once log line.
- **`ManagedConnection<THandle>`** — The lifecycle surface an adapter drives from: `get`, `state`, `forget`, `reportUnavailable`, `stop`.
- **`manageConnection<THandle>(options)`** — Factory that closes over module-local state (memoised handle, in-flight connect promise, warn-once latch) and returns the `ManagedConnection` object. Exports are the three items above; there are no other exports.

## Relationships

- **`@infrastructure/adapters/logger`** — imported for the single `logger.warn` call inside `reportUnavailable`; no other logging occurs in this module.
- **`@infrastructure/observability/dependency-health`** — provides the `DependencyStatus` type used as the return of `state()`.
- **`@infrastructure/adapters/cache.ts`** — a consumer; passes Redis-specific `connect`/`isReady`/`close` into `manageConnection` and relies on `get()` returning `undefined` to skip server-side caching.
- **`@infrastructure/adapters/queue.ts`** — a consumer; calls `forget()` from a channel-close listener to trigger reconnect-on-next-`get()`, and passes a `close` that shuts down the underlying TCP connection even when the channel handle is already dead.
- **`tests/unit/infrastructure/runtime/managed-connection.test.ts`** — unit-tests the factory in isolation with mock adapters.

## Notes

- **No timer-based retry.** Recovery is demand-driven: the next `get()` after a failure makes exactly one clean connect attempt. This is deliberate — an unreachable dependency costs one warn log line, not one per tick.
- **`connect` resolving `undefined` is distinct from rejecting.** A rejection means "tried and failed" (triggers the warn-once log); a `undefined` resolution means "cannot be built at all" (silently treated as unavailable, no warning).
- **`state()` derives `connecting` solely from whether `connectPromise` is set.** This is the single source of truth; reading individual client socket flags is explicitly rejected as a source of disagreement between adapters.
- **`stop()` awaits an in-flight connect before closing** to prevent a socket that finishes opening *after* shutdown from holding the process open. The close itself swallows rejections because shutdown must never throw.
- **`reportUnavailable` is exported** (not private) so that errors arriving outside `connect` (e.g., a mid-publish command rejection) share the same warn-once latch instead of each flooding the log independently.
