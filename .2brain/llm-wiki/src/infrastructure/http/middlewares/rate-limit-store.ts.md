---
source: src/infrastructure/http/middlewares/rate-limit-store.ts
sha256: cffc5c119f32e39c1bbd3b93303568db16eb09489645a11eac8d29c03bb03bab
generated_at: 2026-11-08T03:32:08.095869+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Builds and wraps the counter stores that `express-rate-limit` uses behind each budget. It ensures a single logical rate-limit budget is enforced across all cluster workers and instances (via a dedicated `limits` Redis), provides a circuit-breaker-guarded fallback when Redis is unreachable, and implements a multi-level escalating lockout where repeated violations double the lockout window.

## Key elements

- **`SyncInitStore`** (exported type) — narrows `express-rate-limit`'s `Store.init` from `void | Promise<void>` to a synchronous signature, since every store in this module initialises without awaiting.
- **`lazyRedisStore(namespace, url)`** — returns a `SyncInitStore` that defers `RedisStore` construction (and Lua script loading) to the first `increment` call, keeping module import side-effect free. On init failure the inner store is dropped so the next request rebuilds it.
- **`failoverStore(namespace, primary, onStoreError)`** — wraps a primary store with a process-wide breaker (`BREAKER_WINDOW_MS = 30 s`). While the breaker is open, operations route to an in-process `MemoryStore` (policy `memory`) or reject the promise (policy `pass`). Increments the `rateLimitStoreFallbackTotal` metric on every fallback.
- **`plainStore(namespace, onStoreError)`** — picks between a bare `MemoryStore` (no Redis URL configured) and a `failoverStore` over `lazyRedisStore`. Registers memory stores in the module-level `memoryStores` set.
- **`escalatingStore(namespace, onStoreError, escalation)`** — builds `doublings + 1` level stores (windows `windowMs × 2^level`) plus a strikes store whose window outlasts the longest lockout, producing a lockout that doubles on each repeat violation.
- **`Escalation`** (exported interface) — `{ limit: number; doublings: number }`, the configuration an escalating budget passes in.
- **`liveHits(record)`** — returns `totalHits` only while the window is still active, guarding against `MemoryStore#get` returning expired entries before its sweep runs.
- **`resetMemoryRateLimitCounters`** (exported) — resets every in-process `MemoryStore` in `memoryStores`; used by the demo's `POST /__test/restore` to clear spent budgets after a data reseed.
- **`warnPerProcessCounting(namespace)`** — logs an `error`-level message (once per budget) when no limits Redis is configured and `NODE_CLUSTER_WORKERS > 1`, flagging that effective limits are multiplied by worker count.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — the consuming middleware; calls `plainStore` / `escalatingStore` to obtain the `Store` it hands to `express-rate-limit`.
- **`src/infrastructure/adapters/limits-redis.ts`** — provides `buildLimitsClient`, `limitsKeyPrefix`, `limitsRedisUrl`, and `sendToLimits`; this module binds those into the `RedisStore` and decides whether Redis is configured at all.
- **`src/infrastructure/http/middlewares/store-breaker.ts`** — supplies `createBreaker`, the single process-wide breaker guarding all budgets against Redis connect-timeout cascades.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — exposes `rateLimitStoreFallbackTotal`; incremented on every fallback operation and pre-initialised to 0 per namespace so the first fallback is visible after a restart.
- **`src/infrastructure/runtime/config.ts`** — `clusterConfig().NODE_CLUSTER_WORKERS` drives the per-process-counting warning.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — `RateLimitBudget` type, from which `onStoreError` and `escalation` fields are read by the middleware and passed into this module's store factories.
- **`src/infrastructure/adapters/cache.ts`** — `drainMatchingKeys` is imported (used in the truncated portion for clearing Redis counters via `clearRateLimitCounters`).
- **`scenarios/apply.ts` / `scenarios/support/demo.ts`** — call `resetMemoryRateLimitCounters` as part of the demo restore flow.
- **Tests** — `rate-limit-escalation.test.ts` exercises the multi-level lockout logic; `rate-limit-store-clear.test.ts` covers the memory-store reset; `demo-routes.test.ts` validates the restore endpoint end-to-end.

## Notes

- The `.catch()` on the deferred `init` inside `lazyRedisStore` is **load-bearing**: without it, a failed Lua script load produces an unhandled promise rejection (crashing Jest, polluting production logs) and the broken `RedisStore` stays in use because it re-awaits the rejected promise on every subsequent `increment`. The fix drops the failed inner store so the next request rebuilds it.
- The breaker is **one per process**, shared by all budgets, because they all hit the same Redis instance — one failure implies the same for every budget.
- Failover policy `memory` is the **default** (OWASP A10:2025 — fail secure); `pass` is reserved for the non-security "browsing brake" budget.
- `MemoryStore#get` returns an expired record until its internal sweep runs; `liveHits` compensates so an expired lockout is not treated as active.
- `Stryker disable/restore all` comments around `logger.error` calls prevent the mutation-testing tool from mutating log-only branches that would otherwise look "survived" but are intentionally untestable in isolation.
