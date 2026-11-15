---
source: src/infrastructure/observability/metrics-database.ts
sha256: ef1e145f2674d09f4dec1abe7e7397026c796e14a8c0be5ff60e0b7f35bccbec
generated_at: 2026-11-14T18:12:05.575603+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-database.ts

## Purpose

Defines the single Prometheus counter for database query timeouts (mongod `maxTimeMS` exceeded, error 50). These events are 503-equivalent from the caller's perspective, and without a dedicated series the 5xx alert cannot distinguish "slow" from "down."

## Key elements

- **`queryTimeoutsTotal`** (exported `Counter`) — Increments once per query that mongod kills at its time limit. Intentionally unlabelled: one scalar is the signal, and the surrounding log line already carries the operation name. Registered on the shared `metricsRegistry`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the shared `metricsRegistry` instance this counter registers against, so it appears on the app's single `/metrics` endpoint.
- **`src/infrastructure/observability/metric-config.ts`** — Supplies `counterConfig`, which maps the generated metadata into the options object passed to the `Counter` constructor (name, help text, type, etc.).

## Notes

- Counting happens **where the answer is derived** (i.e. where the timeout error is classified/handled), not at the query-execution call site.
- The counter is deliberately label-free; do not add labels without also revisiting the "one number is the signal" rationale in the docstring.
- See `docs/tools/prometheus.md` for the alerting rules that consume this series.
