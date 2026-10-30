---
source: src/infrastructure/observability/metrics-rate-limit.ts
sha256: 224596fb4b49b6490302148432fefdec018a8cba41475036798481bc55637df3
generated_at: 2026-10-29T02:10:46.755241+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-rate-limit.ts

## Purpose

Defines two Prometheus counters that make rate-limiting behavior alertable (as opposed to log-only). One counter tracks requests served from the Redis fallback path; the other tracks requests hard-refused with 429. Both are labeled by budget namespace and registered on the shared metrics registry.

## Key elements

- **`rateLimitStoreFallbackTotal`** (Counter) — incremented when a rate-limit store operation cannot reach the `limits` Redis instance and falls back to in-process or unbounded behavior. Label: budget namespace. A non-zero rate indicates a budget is weaker than configured.
- **`rateLimitRefusalsTotal`** (Counter) — incremented when a budget returns a 429 to the caller. Label: budget namespace. A sustained rate is the primary alert signal for abuse (scanning, credential stuffing) and includes the global brake, which writes no audit entry.

## Relationships

- **`metrics-registry.ts`** — both counters register against `metricsRegistry` so they are exposed by the single `/metrics` endpoint.
- **`metric-config.ts`** — supplies the shared `counterConfig()` helper (name, help, label schema) that each counter spreads into its options.
- **`metrics.generated.ts`** — provides the `infrastructureMetricData` constants (namespace, help text, label definitions) consumed by `counterConfig`.
- **`rate-limit-store.ts`** — the store implementation that increments `rateLimitStoreFallbackTotal` when the primary Redis is unavailable.
- **`rate-limit.ts`** — the middleware that increments `rateLimitRefusalsTotal` when it responds 429.
- **`tests/unit/infrastructure/http/middlewares/rate-limit.test.ts`** and **`rate-limit-store-selection.test.ts`** — unit tests that assert the correct counter is incremented in each path.
- **`src/modules/account/tests/integration/mail-recipient-budget.test.ts`** — integration test exercising the mail-recipient budget and its metric side-effects.

## Notes

- **Bounded cardinality by construction:** the namespace label values are literals declared on each budget definition, never derived from request data. This keeps the label set small and avoids a Prometheus cardinality explosion.
- **Module-level singletons:** both counters are created at import time (not per-request). Importing this module has the side effect of registering the metrics; tests that import it should be aware the registry now contains these series.
- **Counter, not Gauge:** both metrics are monotonically increasing. Use `rate()` or `increase()` in PromQL; the raw value is only meaningful as "total since process start."
