---
source: src/modules/observability/config.ts
sha256: 288e6503582b23e0c4dfab64c3113a74b002755a01af5b85090cf34cc350746a
generated_at: 2026-11-08T06:38:08.819121+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/config.ts

## Purpose

Declares the typed configuration schema for the observability module — the metrics-scrape credential and the endpoints for Loki and Faro telemetry sinks. It exists to centralize validation rules and placeholder detection so the module can fail fast on misconfiguration.

## Key elements

- **`observabilityConfig`** (exported) — The single config object created via `defineConfig`. Named `'observability'`. Its `shape` defines three env vars:
  - `NODE_METRICS_TOKEN` — a `secret` field (`minLength: 0`, `minBytes: 32`, placeholder `'change-me-dev-metrics-token'`).
  - `NODE_LOKI_HOST` — a `text` field.
  - `NODE_FARO_COLLECTOR_URL` — a `text` field.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides the `defineConfig` factory used to declare the config shape.
- **`src/infrastructure/config/fields.ts`** — provides the `secret` and `text` field-type constructors used in the shape.
- **`src/modules/observability/metrics-scraper.ts`** — consumes `NODE_METRICS_TOKEN`; its `isMetricsScraper` guard denies (503) when the token is unset, making the unset state safe.
- **`src/modules/observability/module.ts`** — wires the observability module; presumably reads `observabilityConfig` to construct services.
- **`src/modules/observability/services/health.ts`** — a health-check service within the same module; may depend on the Loki/Faro endpoints being configured.

## Notes

- `minLength: 0` on `NODE_METRICS_TOKEN` is **intentional**. An unset token is a valid, fail-closed state (the scraper returns 503 by default). The only state that should prevent boot is the token being set *to* the known placeholder `'change-me-dev-metrics-token'` — the framework's placeholder check handles that rejection, not a length check.
- The `minBytes: 32` constraint enforces a real token size while still permitting the "absent" case through `minLength: 0`.
