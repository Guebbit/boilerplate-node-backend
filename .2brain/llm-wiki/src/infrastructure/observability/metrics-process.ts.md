---
source: src/infrastructure/observability/metrics-process.ts
source_sha256: 4b8e0ffc2c963a4772c2420bce037efc6e8960bce95c351951b5215249cb5eaa
context_sha256: e07c13986b3d678acd613fe9c6e3d4898be9810b40d0159d492dcb03db6ac0a9
generated_at: 2026-11-22T02:59:42.373106+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metrics-process.ts

## Purpose
Defines process-level Prometheus metrics. Currently it exposes a single counter for unhandled promise rejections. The application survives such rejections on purpose (see `handleUnhandledRejection`), so this counter makes them visible. The counter is registered on the shared metrics registry.

## Key elements
- `processUnhandledRejectionsTotal`: a `prom-client` `Counter` that counts promise rejections no handler caught. Its configuration comes from `counterConfig(infrastructureMetricData.processUnhandledRejectionsTotal)`, and it registers only on `metricsRegistry`. Any rate above zero indicates a bug: a lost error and unfinished work.

## Relationships
- `metrics-registry.ts`: supplies `metricsRegistry`, the registry this counter is registered against.
- `metric-config.ts`: supplies `counterConfig`, which turns the generated metric data into the counter's constructor options.
- `src/app/error-handling.ts` and `tests/unit/app/error-handling.test.ts`: graph neighbors. The module doc names `handleUnhandledRejection` as the reason this counter exists, so that handler is presumably where the counter is incremented. The file itself doesn't show the increment.

## Notes
- The metric's name, help text and labels come from generated metric data (`infrastructureMetricData`), not from this file.
- The module doc points to `docs/operate/deployment-hardening.md#what-observability-metrics-exposes` for documentation.
