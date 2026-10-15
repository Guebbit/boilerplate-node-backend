---
source: src/modules/observability/config.ts
sha256: 288e6503582b23e0c4dfab64c3113a74b002755a01af5b85090cf34cc350746a
generated_at: 2026-10-15T10:54:08.255974+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/config.ts

## Purpose

Declares the environment-variable schema for the observability module: the metrics scrape credential and the optional telemetry sink addresses (Loki, Faro). Exists so that the rest of the module can validate and access its configuration through a single typed export.

## Key elements

- **`observabilityConfig`** (exported) — The `defineConfig` object for the `observability` namespace. Defines three fields:
  - `NODE_METRICS_TOKEN` — `secret` field. `minLength: 0` (allows unset), `minBytes: 32`, `placeholder: 'change-me-dev-metrics-token'`. Boot fails only if the value is *set* to the placeholder.
  - `NODE_LOKI_HOST` — plain `text` field for the Loki endpoint.
  - `NODE_FARO_COLLECTOR_URL` — plain `text` field for the Faro collector endpoint.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the factory that shapes the exported config object.
- **`src/infrastructure/config/fields.ts`** — Provides the `secret` and `text` field descriptors used in the shape.
- **`src/modules/observability/metrics-scraper.ts`** — Consumes the config; the doc comment notes that `isMetricsScraper` is fail-closed (503) when the token is unset, so this config's `minLength: 0` is intentional.
- **`src/modules/observability/module.ts`** — Wires the observability module together and is expected to read `observabilityConfig` at startup.
- **`src/modules/observability/services/health.ts`** — Health endpoint within the same module; likely surfaced alongside the metrics endpoint governed by this config.

## Notes

- **Unset ≠ invalid.** `minLength: 0` is deliberate: an absent `NODE_METRICS_TOKEN` is a valid, fail-closed state (the scraper returns 503). The only boot-time rejection is the token being *explicitly set* to the known placeholder string, which would silently expose `/observability/metrics`.
- The placeholder ships in `.env-example`; see `docs/tools/configuration.md` for the full configuration guide.
