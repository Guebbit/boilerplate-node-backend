---
source: src/infrastructure/observability/metrics-cache.ts
source_sha256: 11e08c5306da888ae00f4d0e5991dd037fa07398ebfabd836b2bdb35a2e75e95
context_sha256: 0ca0e0a4f19e26c52231284657fa12126c3d80a916868f21b0bf791faef6bbfd
generated_at: 2026-11-22T02:58:55.898439+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-cache.ts

## Purpose
Defines the Prometheus counters for the cache layer and registers them on the shared metrics registry. It exists because a log line is not alertable: cache invalidation failures and hit/miss outcomes need to be observable as metrics.

## Key elements
- `cacheInvalidationFailuresTotal` – `Counter` of invalidations that could not reach Redis, by tag. It captures the case where a write succeeds, its cached predecessor is not removed, and the stale response is served for the endpoint's full TTL. A rate above zero means the catalogue is serving stale data. Tags are literals declared on routes, never request data, so the label set is bounded.
- `cacheRequestsTotal` – `Counter` of `setCache` lookups by outcome. It is the only hit/miss signal the cache has. The four outcomes are:
  - `hit`: fresh.
  - `stale`: past soft expiry, served from the old body.
  - `refresh`: past soft expiry, and this caller won the rebuild claim.
  - `miss`: nothing cached.

## Relationships
- `metrics-registry.ts`: supplies `metricsRegistry`, which both counters register against (`registers: [metricsRegistry]`).
- `metric-config.ts`: supplies `counterConfig`, which builds each counter's options from the generated metric definitions.
- `src/infrastructure/adapters/cache.ts` and `src/infrastructure/http/middlewares/cache.ts`: the cache code that these metrics describe, and the likely users of the counters (invalidation, and `setCache` branches). The file itself does not import them. Their unit tests are `tests/unit/infrastructure/adapters/cache.test.ts` and `tests/unit/infrastructure/http/middlewares/cache.test.ts`.

## Notes
- Both counters are bounded by construction. Labels come from literals, not request data.
- By the time an invalidation failure is known, the stale response has already been sent, so observability is the only possible action.
- The registration pattern matches the per-module `metrics.ts` files, as described in `metrics-registry.ts`.
