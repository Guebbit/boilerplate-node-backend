---
source: shared/rules/metrics.yaml
sha256: 2871e52bcb31e1bfa4ea408f0a3db70c9f6d8b9b3e748b6dc342a372e0a2bf3e
generated_at: 2026-11-08T03:09:53.326397+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/metrics.yaml

## Purpose

Declarative source of truth for every infrastructure-level metric (name, kind, help text, label names, and histogram buckets). It is consumed by a code-generation step that emits `src/infrastructure/observability/metrics.generated.ts`; the generated file is what the runtime actually imports. Dashboards and alert rules are written against the metric names declared here, so any rename in this file is a breaking change for monitoring.

## Key elements

- **`metrics` map** — each key is the camelCase constant name used in generated code; each value carries:
  - `name` — Prometheus exposition name (snake_case; counters end `_total`).
  - `kind` — `counter`, `gauge`, or `histogram`.
  - `help` — human-readable description surfaced to scrapers.
  - `labelNames` — ordered label dimensions (omitted when the metric has none).
  - `buckets` — histogram bucket boundaries, present only on `kind: histogram`.
- **Coverage areas** — HTTP request counting/duration, cache hits/misses, outbox publish/retry/dead states, security & auth events, database operation duration, dead-letter queues, rate-limit fallbacks and refusals, process health (uptime, heap, unhandled rejections), and crontab job success/run timestamps.

## Relationships

- **`shared/rules/outbox.yaml`** — declares the outbox event types and dispatch configuration; the four `outboxEvents*` metrics here are the observability surface for the lifecycle defined in that file (written → published / retried / dead → pending gauge).
- **`shared/rules/jobs.yaml`** — defines the crontab job registry; `jobLastSuccessTimestampSeconds` and `jobLastRunTimestampSeconds` expose per-`task` gauges whose label values correspond to the job identifiers declared there.

## Notes

- This file is **never read at runtime**. It is a build-time input; the only entry point is `npm run regenerate`. Editing it without regenerating leaves the generated TS stale.
- The `jobLast*` metrics intentionally label by `task`, not `job`, because the Prometheus scrape target adds its own `job="api"` label; using `job` would cause a collision and force a rename to `exported_job`, breaking any existing rules.
- Histogram bucket units are embedded in the metric name (`_milliseconds`, `_seconds`); do not add a separate `unit` field.
- A module's *own* metrics (defined in its `metrics.ts`) are intentionally excluded from this file; it covers only cross-cutting infrastructure metrics.
