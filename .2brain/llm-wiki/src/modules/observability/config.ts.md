---
source: src/modules/observability/config.ts
source_sha256: cefd22159d2d2dc99f78d9914613a86ae450178fb82ea84f321d1de593b45ca1
context_sha256: 1741c156a1e4063791734cab0401b6e10e3bd912b5bf9cfe6fad10e5de45fb9e
generated_at: 2026-11-22T06:00:23.762911+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/config.ts

## Purpose
Declares the configuration for the `observability` module: the credential used to scrape the metrics endpoint, and the settings for which telemetry sinks (Loki, Faro) are wired.

## Key elements
- `observabilityConfig` — result of `defineConfig({ name: 'observability', shape: {...} })`. The shape has three fields:
  - `NODE_METRICS_TOKEN` — a `secret(...)` with `minLength: 0`, `minBytes: 32`, and `placeholder: 'change-me-dev-metrics-token'`.
  - `NODE_LOKI_HOST` — a plain `text()` field.
  - `NODE_FARO_COLLECTOR_URL` — a plain `text()` field.

## Relationships
- `src/infrastructure/config/define.ts` — supplies `defineConfig`, which builds the config object.
- `src/infrastructure/config/fields.ts` — supplies the `secret` and `text` field builders.
- The other neighbors (`metrics-scraper.ts`, `module.ts`) are listed as related in the dependency graph. This file's content does not show how they use the config. The comment does refer to `isMetricsScraper` denying by default, but that function's location is not shown.

## Notes
- `.env-example` ships `change-me-dev-metrics-token`. If that value were left in place, it would allow scraping `/observability/metrics`. The `placeholder` option makes the app refuse to boot when the token is set to that value.
- `minLength: 0` is deliberate. An unset token is a supported state that already fails closed: `isMetricsScraper` denies by default with a 503. The boot check therefore only blocks the dangerous case, a token set to the placeholder.
- `minBytes: 32` is set alongside `minLength: 0`. The file does not say how the two interact.
- The module's doc comment has a `@see` pointer to the "who-owns-what" section of the configuration docs.
