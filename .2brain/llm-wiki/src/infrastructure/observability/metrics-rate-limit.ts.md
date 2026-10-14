---
source: src/infrastructure/observability/metrics-rate-limit.ts
sha256: e9910083aa36ab777ade597fba5f2303e764186bdfef293653409f5bc517431b
generated_at: 2026-10-14T08:06:46.596349+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-rate-limit.ts

## Purpose

Declares the two Prometheus counters that make rate-limiting behavior alertable: how many store operations degraded to a per-process fallback and how many requests were refused with a 429. Both counters register against the shared `metricsRegistry` so they are collected alongside every other module's metrics.

## Key elements

- **`rateLimitStoreFallbackTotal`** — `Counter` (`rate_limit_store_fallback_total`, label: `namespace`). Incremented whenever a rate-limit store operation could not use the `limits` Redis and served the budget from local memory (per-process) or passed the request through unbudgeted. A sustained rate > 0 means a configured limit is effectively weaker.
- **`rateLimitRefusalsTotal`** — `Counter` (`rate_limit_refusals_total`, label: `budget`). Incremented when a budget rejects a request with HTTP 429, including the global brake (which writes no audit entry). A sustained rate is the alert signal for scanners or credential-stuffing.

Both counters use `labelNames` constrained to literal namespace/budget strings declared on the budgets, keeping the cardinality bounded by construction (no request-derived label values).

## Relationships

- **`./metrics-registry.ts`** — Imports `metricsRegistry` and passes it as the `registers` array on both counters, so they are exposed on the shared collector rather than a local one.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — The store that increments `rateLimitStoreFallbackTotal` when it falls back to in-process or open behavior.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — The middleware that increments `rateLimitRefusalsTotal` when it returns a 429.
- **`tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts`** — Exercises the fallback path that feeds `rateLimitStoreFallbackTotal`.
- **`tests/unit/infrastructure/http/middlewares/rate-limit.test.ts`** — Exercises the refusal path that feeds `rateLimitRefusalsTotal`.

## Notes

- The two counters are intentionally separate: a fallback (degraded but serving) and a refusal (429) answer different operational questions. Conflating them would hide a partial outage.
- Label values are **never** request data; they come from static budget/namespace literals, so Prometheus cardinality cannot grow with traffic.
- The file is a `@module` (no default export); consumers import the two named counters directly.
