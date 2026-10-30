---
source: src/infrastructure/http/middlewares/rate-limit-store.ts
sha256: ab1e5b0b9821f59af2df9f5bb977220805d5f021241894f2ae5713a40059b9c7
generated_at: 2026-10-29T02:03:46.545342+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Provides the `Store` implementations that `express-rate-limit` uses to count hits for each rate-limit budget. Because the app forks one worker per CPU, an in-process `Map` would multiply every budget by the worker count; this module routes counters through a dedicated "limits" Redis instance (separate from the response cache) so the budget holds globally, and falls back to per-process memory or pass-through when Redis is unavailable.

## Key elements

- **`SyncInitStore`** (exported type) — Narrows `Store.init` from `void | Promise<void>` to a synchronous return, eliminating floating-promise lint noise at call sites.
- **`breaker`** (module-level const) — A single process-wide circuit breaker (30 s window) shared by every budget, since all budgets share the same Redis.
- **`lazyRedisStore(namespace, url)`** — Returns a `SyncInitStore` whose `RedisStore` is constructed only on the first `increment`, keeping module import connection-free. The deferred `init().catch()` is load-bearing: it prevents an unhandled rejection and drops the failed store so the next request rebuilds a fresh one.
- **`failoverStore(namespace, primary, onStoreError)`** — Wraps a primary (Redis) store with a `MemoryStore` fallback (or a rejection for `pass` budgets). Each operation routes through the breaker; on failure it falls back per the budget's `onStoreError` policy and increments `rateLimitStoreFallbackTotal`.
- **`warnPerProcessCounting(namespace)`** — Logs an `error`-level message (not `warn`) once per budget when no Redis URL is set and `NODE_CLUSTER_WORKERS > 1`, flagging the silent budget multiplication.
- **`plainStore(namespace, onStoreError)`** — Returns a bare `MemoryStore` when no limits Redis is configured, otherwise a `failoverStore` wrapping a `lazyRedisStore`.
- **`liveHits(record)`** — Returns `totalHits` only if the record's `resetTime` is still in the future; guards against `MemoryStore` serving stale (not-yet-swept) entries.
- **`Escalation`** (exported interface) — `{ limit, doublings }` describing the cap and how many times the lockout may double.
- **`escalatingStore(namespace, onStoreError, escalation)`** — Builds one `plainStore` per doubling level (windows of `windowMs × 2^level`) plus a strikes store. On each request it determines whether the key is locked at any level; if not, it routes counting to the level selected by the strike count. A fresh lockout at level *n* is recorded by counting into the level-*n* store past the cap.

## Relationships

- **`src/infrastructure/adapters/limits-redis.ts`** — Supplies `limitsRedisUrl`, `limitsKeyPrefix`, and `sendToLimits` (the raw-command sender bound to node-redis). The store never imports a generic Redis client; all limits-Redis traffic goes through these helpers.
- **`src/infrastructure/http/middlewares/store-breaker.ts`** — Provides `createBreaker`; this module instantiates the single shared breaker here.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — Provides the `rateLimitStoreFallbackTotal` counter, incremented on every fallback operation (and zero-initialised per namespace at construction).
- **`src/infrastructure/runtime/config.ts`** — Provides `clusterConfig` for the `NODE_CLUSTER_WORKERS` check in `warnPerProcessCounting`.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` used for error-level messages on init failure and per-process counting warnings.
- **`src/infrastructure/adapters/cache.ts`** — Imports `drainMatchingKeys` (used by callers to clear counters, exercised in `rate-limit-store-clear.test.ts`).
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — The middleware that consumes the stores built here.
- **`src/types/rate-limit-budget.ts`** — Defines `RateLimitBudget` whose `onStoreError` field selects the fallback policy.
- **Tests** (`rate-limit-store.test.ts`, `rate-limit-store-clear.test.ts`, `rate-limit-store-selection.test.ts`, `rate-limit-escalation.test.ts`) — Cover basic counting, key clearing, store selection logic, and the escalating-doubling behaviour respectively.

## Notes

- **Fallback is secure-by-default.** The default `onStoreError` is `'memory'` (a per-worker limit still holds). `'pass'` is reserved for the "browsing brake" budget. This follows OWASP A10:2025 (fail secure).
- **The breaker is process-wide, not per-budget.** One Redis serves all budgets, so a single connection failure means all of them fall back simultaneously.
- **`lazyRedisStore` drops the failed inner store.** `RedisStore` caches the rejected Lua-script-load promise and would await it on every subsequent `increment`, keeping the limiter open until a restart. Resetting `inner` to `undefined` on failure ensures the next request builds a fresh store.
- **`escalatingStore` uses separate stores per level rather than extending TTLs.** Neither `RedisStore` nor `MemoryStore` supports per-key TTL modification after set, so each level is its own store with its own `windowMs`.
- **`Stryker disable all` / `restore all`** markers wrap `logger.error` calls in `warnPerProcessCounting` and the init-failure handler, indicating those branches are intentionally excluded from mutation testing.
