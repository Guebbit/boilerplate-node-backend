---
source: src/infrastructure/http/middlewares/rate-limit-store.ts
sha256: b87da88b0009f48c12721c5881801214f192acb64e4f9b7b8a63a5bcdf292f3e
generated_at: 2026-10-14T07:57:39.850442+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Provides the `express-rate-limit` `Store` implementations that back every rate-limit budget in the application. It solves the multi-process problem (each `cluster.ts` worker would otherwise hold its own in-memory budget) by routing counters through a dedicated `limits` Redis instance, with a circuit-breaker–guarded in-memory fallback so a Redis outage degrades gracefully rather than crashing or passing every request.

## Key elements

- **`breaker`** — A single process-wide circuit breaker (30 s window) shared by all budgets. One Redis failure means all budgets fall back simultaneously.
- **`lazyRedisStore(namespace, url)`** — Returns a `Store` that defers `RedisStore` construction (and its Lua-script load / Redis connection) until the first `increment`. Prevents a network round-trip at module import time. The `.catch()` on the deferred `init()` is load-bearing: an unhandled rejection would kill the process (Node 15+), and a half-initialised store would stay broken until restart, so it is discarded on failure.
- **`failoverStore(namespace, primary, onStoreError)`** — Wraps `primary` with the breaker. On failure it either serves from a `MemoryStore` (`onStoreError: 'memory'`) or rejects so the caller passes the request (`onStoreError: 'pass'`). Increments the `rateLimitStoreFallbackTotal` metric on every fallback hit.
- **`warnPerProcessCounting(namespace)`** — Logs an `error`-level message (once per budget) when no `limits` Redis URL is set and `NODE_CLUSTER_WORKERS > 1`, making the silently-multiplied budget visible in paged alerts.
- **`plainStore(namespace, onStoreError)`** — Factory that returns a `MemoryStore` when no Redis URL is configured, or a `failoverStore` wrapping a `lazyRedisStore` otherwise.
- **`liveHits(record)`** — Returns `totalHits` only if the record's `resetTime` is in the future; guards against `MemoryStore#get` returning a stale (expired-but-not-yet-swept) entry that would keep a lockout alive past its window.
- **`Escalation`** *(exported interface)* — `{ limit: number; doublings: number }`; the cap and how many times the lockout may double.
- **`escalatingStore(namespace, onStoreError, escalation)`** — A `Store` whose lockout doubles on each repeated cap violation. Because neither Redis nor `MemoryStore` can extend a single key's TTL after creation, it maintains **one plain store per level** (windows `windowMs × 2^level`) plus a strikes store whose window outlives the longest lockout. `increment` first checks whether the key is already locked at any level (highest first); if not, the strike count picks the level for the new hit.

## Relationships

- **`@infrastructure/adapters/limits-redis`** — Source of `limitsRedisUrl`, `limitsKeyPrefix`, `sendToLimits`, and `buildLimitsClient`. This file uses `sendToLimits` as the `sendCommand` binding for `rate-limit-redis` and `limitsRedisUrl` to decide whether to use Redis at all.
- **`@infrastructure/adapters/redis`** — `closeRedisClient` is imported (used in the truncated remainder, likely for shutdown).
- **`@infrastructure/adapters/logger`** — Error-level logs for store-init failures and per-process counting warnings.
- **`@infrastructure/adapters/cache`** — `drainMatchingKeys` is imported (used in the truncated remainder, presumably for clearing keys on reset).
- **`@infrastructure/http/middlewares/store-breaker`** — `createBreaker` supplies the circuit-breaker primitive used by `failoverStore`.
- **`@infrastructure/observability/metrics-rate-limit`** — `rateLimitStoreFallbackTotal` metric is initialised to zero at startup and incremented on every fallback operation.
- **`@infrastructure/runtime/config`** — `clusterConfig` is consulted to detect multi-worker deployments.
- **`@types` / `@types/rate-limit-budget`** — `RateLimitBudget` type drives the `onStoreError` policy and the `escalation` fields.
- **`@infrastructure/http/middlewares/rate-limit.ts`** — The middleware that constructs and mounts the stores returned here.
- **Tests** — `rate-limit-store.test.ts` (basic behaviour), `rate-limit-store-selection.test.ts` (Redis vs. memory selection), `rate-limit-store-clear.test.ts` (key clearing), `rate-limit-escalation.test.ts` (doubling logic).
- **`scenarios/apply.ts`** — Integration scenario that exercises the full store stack.

## Notes

- **One breaker, all budgets.** The breaker is intentionally process-wide: all budgets hit the same Redis, so a single failure is a single failure. Do not create per-budget breakers.
- **Fail-secure default.** `onStoreError: 'memory'` is the default per OWASP A10:2025. `pass` should only be used for the browsing brake (non-security) budget.
- **Lazy init + `.catch()` is not optional.** Removing the `.catch()` or the `inner = undefined` reset reintroduces either a fatal unhandled rejection or a permanently-broken store that requires a process restart.
- **Escalating store is N+1 stores.** Each level and the strikes counter are independent `plainStore` instances with their own Redis keys (`:x0`, `:x1`, …, `:strikes`). This means a full Redis outage degrades every level independently, and the memory fallback for one level does not affect another.
- **`drainMatchingKeys` from `cache.ts`** is imported here but the `limits` Redis is a separate instance from the response cache; the import is used for key-clearing utilities, not for reading the cache.
