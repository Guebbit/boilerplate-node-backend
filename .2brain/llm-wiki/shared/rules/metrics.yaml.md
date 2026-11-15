---
source: shared/rules/metrics.yaml
sha256: 682d2d4412a03aa78c317aa7a52defa52b4f0c12983873ac478b7f22c058925a
generated_at: 2026-11-14T17:46:17.192822+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/metrics.yaml

## Purpose

Single source of truth for every **infrastructure-level** metric name, kind, help text, labels, and (for histograms) buckets. It is data, not code: `npm run regenerate` compiles it into `src/infrastructure/observability/metrics.generated.ts`, and dashboards/alerts are written against the names declared here. Module-specific metrics deliberately stay in their own `metrics.ts`.

## Key elements

- **`metrics` map** — one entry per metric, keyed by the camelCase constant the TypeScript code uses.
- **Entry fields**
  - `name` — Prometheus metric name (snake_case; counters end in `_total`).
  - `kind` — `counter`, `gauge`, or `histogram`.
  - `help` — human-readable description used in the generated registry.
  - `labelNames` — (optional) label dimensions.
  - `buckets` — (histogram only) upper-bound boundaries in the unit stated in the name (ms for `http_request_duration_milliseconds`, s for `db_client_operation_duration_seconds`).
- **Coverage** — HTTP (requests, duration, errors, in-flight), database (duration, timeouts), cache (requests, invalidation failures), outbox (published, retried, dead, pending), security (events, stale credentials), rate-limiting (fallback, refusals), queue (dead-lettered), process (uptime, heap limit, unhandled rejections), and crontab jobs (last success, last run).

## Relationships

- **`shared/rules/jobs.yaml`** — defines the crontab jobs whose identity appears as the `task` label on `jobLastSuccessTimestampSeconds` / `jobLastRunTimestampSeconds`. Changing a job name in `jobs.yaml` requires the matching label value to remain consistent here.
- **`shared/rules/outbox.yaml`** — configures the outbox pipeline that drives the four `outbox_*` metrics (published, retried, dead, pending). The metric names and labels are stable references used by dashboards regardless of outbox tuning.

## Notes

- **Not read at boot.** The file is a build-time input; the generated TS is what ships. Editing this file has no effect until `npm run regenerate` is run.
- **Label-name collision guard.** `jobLastSuccessTimestampSeconds` and `jobLastRunTimestampSeconds` use `task` (not `job`) as their label because Prometheus scraping adds its own `job="api"` label; a clash would be silently renamed to `exported_job`, breaking any rule that filters on `job`.
- **Counter naming convention.** Every counter's Prometheus name ends in `_total`; the camelCase key does not (e.g. key `httpRequestsTotal` → name `http_requests_total`).
- **Buckets belong only to histograms.** Counters and gauges have no `buckets` field.
