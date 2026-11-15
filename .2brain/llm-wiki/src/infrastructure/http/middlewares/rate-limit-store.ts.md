---
source: src/infrastructure/http/middlewares/rate-limit-store.ts
sha256: 01c7920e8b95c4255408f1b79dc3204dc6e44b026a4062fe9f7af413d92a97bc
generated_at: 2026-11-14T18:03:13.418289+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Provides the counter stores that `express-rate-limit` uses to track per-client hits. When a `limits` Redis URL is configured, counters live in a shared Redis instance so the budget is consistent across cluster workers and replicas; otherwise it falls back to a per-process `MemoryStore`. The module also implements a circuit breaker for Redis outages and an escalating-lockout wrapper that doubles the lockout window on repeated violations.

## Key elements

- **`SyncInitStore`** (type export) — A `Store` variant whose `init` is synchronously typed, avoiding floating-promise lint noise at call sites.
- **`lazyRedisStore`** — Wraps `rate-limit-redis`'s `RedisStore` so the Lua-script connection is opened on the first `increment`, not at module import. Includes a load-bearing `.catch` that discards the failed store and logs the error.
- **`failoverStore`** — Routes every store operation through a process-wide circuit breaker (`store-breaker.ts`). On Redis failure it delegates to either a `MemoryStore` (`onStoreError: 'memory'`) or rejects so the middleware can pass the request (`onStoreError: 'pass'`). Increments the `rateLimitStoreFallbackTotal` metric on each fallback.
- **`plainStore`** — Factory that returns a `MemoryStore` (tracked in `memoryStores` for reset) when no Redis URL is set, or a `failoverStore` wrapping a `lazyRedisStore` when it is.
- **`escalatingStore`** (implied by `Escalation` interface and surrounding code) — Builds one `plainStore` per escalation level, each with its own `windowMs × 2^level`, plus a strike-count store. A key that repeatedly hits the cap is locked at progressively longer windows.
- **`resetMemoryRateLimitCounters`** (export) — Resets every in-process `MemoryStore` created by this module; used by the demo `POST /__test/restore` route to clear spent budgets after a reseed.
- **`warnPerProcessCounting`** — Logs an `error`-level message (once per budget) when running in cluster mode with >1 worker and no `limits` Redis, because the effective budget is silently multiplied by the worker count.
- **`liveHits`** — Returns `totalHits` from a `ClientRateLimitInfo` record only if the window hasn't expired, preventing `MemoryStore` from reporting stale entries past their reset time.

## Relationships

- **`src/infrastructure/adapters/limits-redis.ts`** — Supplies `limitsRedisUrl()`, `limitsKeyPrefix()`, and `sendToLimits()` (the `sendCommand` binding for `RedisStore`).
- **`src/infrastructure/http/middlewares/store-breaker.ts`** — Provides `createBreaker`; the breaker instance is module-level (one per process) and gates every Redis-backed store operation.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — The middleware that calls `init`/`increment`/`decrement`/`get` on the stores built here.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — `rateLimitStoreFallbackTotal` is incremented on every fallback hit.
- **`src/infrastructure/runtime/config.ts`** / **`src/infrastructure/runtime/cluster-policy.ts`** — `clusterConfig()` and `workerTarget()` are read by `warnPerProcessCounting` to detect the multi-worker-without-Redis condition.
- **`src/types/rate-limit-budget.ts`** — `RateLimitBudget` type defines `onStoreError` and other budget fields consumed by `plainStore`/`failoverStore`.
- **`scenarios/support/demo.ts`** — Calls `resetMemoryRateLimitCounters` during the demo restore flow.
- **`tests/unit/infrastructure/http/middlewares/rate-limit-escalation.test.ts`** — Unit-tests the escalating-lockout store logic.

## Notes

- The breaker window is fixed at **30 s**; it is long enough to absorb a Redis outage without adding the 1 s connect timeout to every request, and short enough to probe recovery within a minute.
- `pass` failure policy is deliberately reserved for low-severity "browsing brake" budgets; the default (`memory`) keeps a security control active per-process. The code cites OWASP A10:2025 for this choice.
- `MemoryStore` instances are tracked in a module-level `Set` (`memoryStores`) exclusively so `resetMemoryRateLimitCounters` can clear them; Redis stores are not in this set.
- The `.catch` on the lazy `RedisStore.init` is **load-bearing**: without it, the rejected script-load promise would be re-awaited on every subsequent `increment`, leaving the limiter broken until a process restart. The handler nulls `inner` so the next request rebuilds a fresh store.
- `drainMatchingKeys` from `src/infrastructure/adapters/cache.ts` and `closeRedisClient` from `src/infrastructure/adapters/redis.ts` are imported but their call sites fall in the truncated portion of the file (likely used in a cleanup/export path).
