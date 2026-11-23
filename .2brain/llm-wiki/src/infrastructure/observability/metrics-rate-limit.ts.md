---
source: src/infrastructure/observability/metrics-rate-limit.ts
source_sha256: e12c1150d9abd4058fb5bc850dad22b77694763e797ae019647ecc24abc94078
context_sha256: 367c985731fc2ca0f740e5537065f9927a0eb0655c03946dc353192dda864bd6
generated_at: 2026-11-22T03:00:08.139221+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-rate-limit.ts

## Purpose
Defines the Prometheus counters for the rate-limit subsystem. A log line is not alertable: an outage is logged once, but how many requests were served from the fallback or refused is a number. The counters register against the shared `metricsRegistry`, like each module's own `metrics.ts`.

## Key elements
- `rateLimitStoreFallbackTotal` — `Counter` for store operations that could not use the `limits` Redis, by budget namespace. A rate above zero means a limit is weaker than configured. This covers a budget counting only in the current process, and a budget letting requests through unbudgeted.
- `rateLimitRefusalsTotal` — `Counter` for requests a budget refused with a 429, by budget namespace. It includes the global brake, which writes no audit entry. A sustained rate is the alert signal, for example a scanner or credential-stuffing run.

Both counters are built from `counterConfig(...)`, fed by `infrastructureMetricData.*` (imported from `@infrastructure/observability/metrics.generated`), and register only on `metricsRegistry`.

## Relationships
- `metrics-registry.ts` — supplies `metricsRegistry`, the only registry these counters register on.
- `metric-config.ts` — supplies `counterConfig`, which turns the generated metric data into the `Counter` options (name, help, labels).
- `rate-limit-store.ts` and `rate-limit.ts` (HTTP middlewares) — the rate-limit code that the counters describe. The fallback counter relates to the store and the refusal counter to the 429 path. This file doesn't import them, and the exact increment sites aren't visible here.
- The rate-limit unit tests (`rate-limit.test.ts`, `rate-limit-store-selection.test.ts`) and the integration test `mail-recipient-budget.test.ts` are graph neighbors of this file. The file content doesn't show how they use the counters.

## Notes
- The namespace label is bounded by construction. Namespaces are literals declared on the budgets, never request data, so label cardinality stays fixed.
- Metric names and labels are defined in the generated data, not in this file.
