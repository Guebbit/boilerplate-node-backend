---
source: src/infrastructure/observability/metrics-cache.ts
sha256: 33d30a1117c5e03e84bf21f2dca497c82317f971f1d86c375fe1b741cd925e07
generated_at: 2026-09-23T17:48:42.703569+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-cache.ts

## Purpose

Defines the two Prometheus counters for the HTTP cache subsystem. The file exists because the cache is a side-effectful path (invalidations, stale-while-revalidate) where a log line would be the only signal, and log lines are not alertable.

## Key elements

- **`cacheInvalidationFailuresTotal`** (`Counter`, label: `tag`) — incremented when a cache invalidation could not reach Redis, meaning a stale response will be served for the remainder of the endpoint's TTL. The `tag` label is bounded by route-level literals, not request data.
- **`cacheRequestsTotal`** (`Counter`, label: `result`) — counts `setCache` lookups by outcome: `hit`, `miss`, `stale`, or `refresh`. The `result` label is bounded by the four branch literals `setCache` itself produces.

Both counters register against the shared `metricsRegistry` instance and use `prom-client`'s `Counter` type.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — imported directly; provides the shared `Registry` instance that both counters attach to. This file follows the same registration pattern as every other per-module `metrics.ts`.
- **`src/infrastructure/http/middlewares/cache.ts`** — the `setCache` middleware is the emitter of `cacheRequestsTotal` (its four branches produce the `result` label values).
- **`src/infrastructure/adapters/cache.ts`** — the cache adapter is the emitter of `cacheInvalidationFailuresTotal` (Redis-unreachable invalidation path).
- **`tests/unit/infrastructure/adapters/cache.test.ts`** / **`tests/unit/infrastructure/http/middlewares/cache.test.ts`** — exercise the emitting code paths; the metric labels are asserted there.

## Notes

- Both `labelNames` arrays are explicitly bounded ("by construction") so cardinality cannot explode from untrusted input. The comments treat this as a design constraint, not just a default.
- The counters are **not** reset or cleared on module teardown; they live for the process lifetime on the shared registry.
- See `docs/tools/prometheus.md` (referenced in the module JSDoc) for the broader metrics conventions and alerting setup.
