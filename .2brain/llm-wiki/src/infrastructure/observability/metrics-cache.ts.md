---
source: src/infrastructure/observability/metrics-cache.ts
sha256: fb2fe6326dff52cc8ee278409b8ca4b2e20df298732d27c35405bd7b0100e396
generated_at: 2026-11-08T03:39:55.127736+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-cache.ts

## Purpose

Defines two Prometheus counters that make Redis-cache behavior observable and alertable: one for invalidation failures (stale-data exposure) and one for `setCache` lookup outcomes. It exists because a log line cannot trigger an alert, and cache hit-rate / stampede size otherwise remain unmeasured estimates.

## Key elements

- **`cacheInvalidationFailuresTotal`** (Counter) — Counts cache-invalidations that could not reach Redis, labelled by a route-declared tag. A non-zero rate indicates a write succeeded but its cached predecessor was left in place, so stale responses are being served until full TTL expiry.
- **`cacheRequestsTotal`** (Counter) — Counts `setCache` lookups by outcome with four literal labels: `hit` (fresh), `stale` (past soft-expiry, old body served), `refresh` (past soft-expiry, this caller won the rebuild claim), `miss` (nothing cached). Provides the only direct hit/miss signal the cache layer has.

Both are constructed with `counterConfig(...)` spread plus an explicit `registers: [metricsRegistry]` array.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Supplies the shared `metricsRegistry` instance against which both counters register (instead of the default prom-client registry).
- **`src/infrastructure/observability/metric-config.ts`** — Provides `counterConfig`, which combines generated metric metadata into the options object passed to `new Counter(...)`.
- **`src/infrastructure/adapters/cache.ts`** — Expected emitter: increments `cacheInvalidationFailuresTotal` on Redis write failures and `cacheRequestsTotal` inside `setCache`'s branching logic.
- **`src/infrastructure/http/middlewares/cache.ts`** — Expected emitter for the HTTP-layer cache path; increments the same two counters from the request/response cycle.
- **`tests/unit/infrastructure/adapters/cache.test.ts`** / **`tests/unit/infrastructure/http/middlewares/cache.test.ts`** — Unit tests that exercise the counter-incrementing code paths in the adapter and middleware respectively.

## Notes

- **Label cardinality is bounded by construction.** Tags come from route-level literals or the four fixed `setCache` branch names, never from request data. No dynamic label sanitisation is needed.
- **Non-default registry.** Both counters pass `registers: [metricsRegistry]` explicitly; forgetting this would silently attach them to prom-client's default registry and they would not appear in the application's scrape endpoint.
- **`metrics.generated` import** (`infrastructureMetricData`) is auto-generated metadata; the file does not define metric names or help strings itself.
