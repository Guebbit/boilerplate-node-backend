---
source: tests/unit/infrastructure/observability/metrics-registry.test.ts
sha256: 864622afaab074255885dc5210561bbd3744c95da2467f97449f5b4105b7f701
generated_at: 2026-09-23T20:25:07.585663+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/metrics-registry.test.ts

## Purpose

Unit tests for the `getPrometheusMetrics` export from the observability metrics registry. Verifies that the rendered Prometheus exposition text includes expected default metric families, guarding against accidental removal of `prom-client` defaults.

## Key elements

- **`describe('getPrometheusMetrics — standard families')`** — single suite around the `getPrometheusMetrics` function.
- **Test: `includes process_uptime_seconds`** — asserts the output string contains the `# HELP process_uptime_seconds` line.
- **Test: `includes nodejs_eventloop_lag_seconds`** — asserts the output string contains the `nodejs_eventloop_lag_seconds` metric name.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — sole dependency. The test imports `getPrometheusMetrics` (via the `@infrastructure/observability/metrics-registry` alias) and calls it to obtain the exposition-format string it then asserts against.

## Notes

- The assertions are substring checks on the full exposition text, not on structured metric objects. A change in formatting (e.g., reordered HELP/TYPE lines) will not break these tests, but removing a default collector entirely will.
- The test file lives under `tests/unit/infrastructure/observability/`, mirroring the source path `src/infrastructure/observability/`.
