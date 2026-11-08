---
source: src/infrastructure/observability/metrics-rate-limit.ts
sha256: 224596fb4b49b6490302148432fefdec018a8cba41475036798481bc55637df3
generated_at: 2026-11-08T03:40:50.319469+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-rate-limit.ts

## Purpose

Defines two Prometheus counters for rate-limiting observability, making fallback usage and 429 refusals alertable as numbers rather than one-off log lines. Registers both against the shared process-wide registry.

## Key elements

- **`rateLimitStoreFallbackTotal`** (`Counter`) — Incremented when a budget's `limits` Redis is unavailable and the store serves a fallback. Labeled by budget namespace. A non-zero rate means a limit is weaker than configured (per-worker budget, not per-deployment).
- **`rateLimitRefusalsTotal`** (`Counter`) — Incremented on every 429 a budget returns, including the global brake (which writes no audit entry). Labeled by budget namespace. A sustained rate signals a scanner or credential-stuffing burst.
- Both counters derive their config (name, help, label names) from `counterConfig(infrastructureMetricData.…)` and register against `metricsRegistry`.

## Relationships

- **`metrics-registry.ts`** — Provides the shared `Registry` instance; both counters pass it as the `registers` array so they appear on the single `/metrics` endpoint.
- **`metric-config.ts`** — Supplies the `counterConfig` helper that maps a generated metric descriptor into a `prom-client` counter option bag (name, help, `labelNames`).
- **`rate-limit-store.ts`** / **`rate-limit.ts`** — The runtime components that `.inc()` these counters (store fallback path and 429 refusal path respectively).
- **`rate-limit-store-selection.test.ts`**, **`rate-limit.test.ts`**, **`mail-recipient-budget.test.ts`** — Test suites that exercise the code paths expected to increment these counters.

## Notes

- Label cardinality is bounded by construction: the `namespace` label takes only the literal strings declared on budgets, never per-request data. This is stated explicitly in both counter definitions.
- This file is a side-effect-free module import; the only "work" at import time is registering the two counters with the shared registry (standard `prom-client` behavior via the `registers` option).
- Metric metadata lives in `metrics.generated.ts` (auto-generated), so adding a new rate-limit metric starts there, not in this file.
