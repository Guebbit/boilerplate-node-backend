---
source: src/infrastructure/http/middlewares/rate-limit-store.ts
source_sha256: 1f24b78a00846f89b9bf6cf747a5005459a66d2459202bccd60ca4273e40ddc1
context_sha256: d15925f5dde1e9c4b032941d2c1e18fc7843cf3966defa7fc7d96fe238bcb267
generated_at: 2026-11-22T02:51:32.992884+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose
Decides where the rate limiters keep their counters. `express-rate-limit`'s default in-process `Map` gives each process its own budget (so the effective budget becomes `budget × processes`). This file builds stores backed by a dedicated `limits` Redis instance, making it a single budget across processes, with memory fallbacks when Redis is unavailable. The limits Redis is a separate instance from the response cache, so cache-key floods cannot evict counters.

## Key elements
- `SyncInitStore` (type): a `Store` whose `init` is typed as synchronous, avoiding floating-promise warnings.
- `BREAKER_WINDOW_MS` / `breaker`: a single process-wide breaker (30 s window, from `createBreaker`). After a store error, all budgets skip Redis until one request probes it again.
- `lazyRedisStore(namespace, url)`: wraps `RedisStore` (`rate-limit-redis`) and constructs it only on the first `increment`, so importing the module makes no connection. It replays the `Options` given to `init` and keys are prefixed `${limitsKeyPrefix()}:${namespace}:`. The `.catch()` on its `init` logs the error and drops the failed store so the next request builds a fresh one.
- `failoverStore(namespace, primary, onStoreError)`: routes each operation to Redis through the breaker. On failure or an open breaker it increments `rateLimitStoreFallbackTotal` and applies the budget's `onStoreError` policy:
  - `memory`: count in a local `MemoryStore`. This is the default, since a security control fails secure.
  - `pass`: reject, so `passOnStoreError` lets the request through. Reserved for the browsing brake.
- `memoryStores` / `resetMemoryRateLimitCounters()` (exported): tracks every in-process `MemoryStore` built by `plainStore` and empties them all. Used by the demo's `POST /__test/restore` (demo profile only).
- `plainStore(namespace, onStoreError)`: returns a `MemoryStore` when no limits URL is configured, otherwise a `failoverStore` over a `lazyRedisStore`.
- `liveHits(record)`: returns a record's hit count, or 0 once its window has ended. This matters because `MemoryStore#get` can return expired entries before its sweep runs.
- `Escalation` (interface, exported): `{ limit, doublings }`.
- `escalatingStore(namespace, onStoreError, escalation)`: a store whose lockout doubles each time a key hits the cap again. It uses one `plainStore` per level (window `windowMs × 2^level`, namespace `:x<level>`) plus a `:strikes` store whose window outlasts the longest lockout. `lockedLevel` finds the highest level at which the key's live hits exceed the limit, and a `levelOf` helper (cut off in the source shown) chooses the counting level. Level is recomputed from counters on each call, so there is no per-key memory to grow.

## Relationships
- `src/infrastructure/adapters/limits-redis.ts`: supplies `limitsRedisUrl`, `limitsKeyPrefix`, `buildLimitsClient` and `sendToLimits`, which is the command channel `RedisStore` uses.
- `src/infrastructure/adapters/redis.ts`: `closeRedisClient` is imported here.
- `src/infrastructure/adapters/cache.ts`: `drainMatchingKeys` is imported here. (The comment mentions `clearRateLimitCounters` for Redis counters.)
- `src/infrastructure/adapters/logger.ts`: logs store initialisation failures.
- `src/infrastructure/http/middlewares/store-breaker.ts`: `createBreaker` provides the shared circuit breaker (`admit`, `succeeded`, `failed`).
- `src/infrastructure/observability/metrics-rate-limit.ts`: `rateLimitStoreFallbackTotal` counter, labelled by namespace and pre-initialised to 0.
- `src/types/rate-limit-budget.ts` (via `@types`): `RateLimitBudget['onStoreError']` sets the failure policy.
- `src/infrastructure/http/middlewares/rate-limit.ts`: the limiter definitions that consume these stores.
- `scenarios/apply.ts`, `scenarios/support/demo.ts` and `tests/integration/scenarios/demo-routes.test.ts` relate to the demo restore flow and `resetMemoryRateLimitCounters`.
- Unit tests `tests/unit/infrastructure/http/middlewares/rate-limit-escalation.test.ts`, `rate-limit-store-clear.test.ts` and `rate-limit-store-selection.test.ts` cover escalation, clearing and store selection.

## Notes
- Nothing refuses to boot without the limits Redis. Copies cannot be detected from inside a process, so configuring it is the operator's job.
- `lazyRedisStore` relies on `increment` always being the first call, since nothing decrements or resets a key it has not counted.
- Dropping a failed `RedisStore` is deliberate: it caches the rejected script-load promise, which would otherwise leave the limiter open until restart.
- Escalating budgets' level and strike stores are plain stores, so they get the same Redis and memory-fallback behaviour as flat budgets.
