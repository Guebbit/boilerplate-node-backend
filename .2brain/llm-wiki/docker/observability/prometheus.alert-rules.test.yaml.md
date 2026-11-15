---
source: docker/observability/prometheus.alert-rules.test.yaml
sha256: b3076c6c9789e66874a73772326a2aea23aea31bce93aa500eb05201b3ca2ac5
generated_at: 2026-11-14T17:12:11.284857+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.test.yaml

## Purpose

Prometheus rule unit tests for `prometheus.alert-rules.yaml`, executed via `promtool test rules`. Each alert gets at least one firing case and one quiet (non-firing) case, with extra quiet cases for expressions that are easy to get wrong (cross-series aggregation, label-mismatched joins, `task`-label reads). Runs in CI under the `alert-rules` job in `.github/workflows/ci.yml`.

## Key elements

- **`rule_files`** — Points to the single file under test: `prometheus.alert-rules.yaml`.
- **`evaluation_interval: 1m`** — Global tick; individual tests can override (e.g. `interval: 1d` for the stale-job test).
- **Test cases (one per alert):**
  - `ApiDown` — `up == 0` sustained > 1 min fires; `up == 1` does not.
  - `ApiRestarting` — `process_start_time_seconds` resetting ≥ 3× in 15 min fires; a single reset (a deploy) does not.
  - `PaymentAmountMismatch` — `payment_amount_mismatch_total{field="amount"}` rising fires; flat does not.
  - `PaidOrderWithoutHold` — `inventory_commit_orphaned_total{stage="commit"}` rising fires; both stages flat does not.
  - `AccountExportFailing` — `account_export_failed_total` rising fires; flat does not.
  - `DependencyUnavailable` — `dependency_up` drops below 1: < 1 min → critical (database), 1–5 min → warning (queue); a single-sample blip shorter than `for` does not fire.
  - `HighErrorRate` — 5xx ratio > 5 % over 5 min fires; a flood of 4xx (404/401/429) with negligible 5xx does not.
  - `ScheduledJobNeverSucceeded` — run series present, no success series, > 1 h fires; within the grace hour or success series present → no fire.
  - `ScheduledJobStale` — success timestamp > 30 d old fires (uses `interval: 1d` for speed).
  - `HighP95Latency` — histogram buckets show p95 > 2 s fires.
- **`input_series` / `values` syntax** — Prometheus `promtool` sample-value notation (`0x10`, `0+15x20`, etc.) to build synthetic time series at 1 m granularity.

## Relationships

- **`docker/observability/prometheus.alert-rules.yaml`** — The sole file under test; every `alertname` referenced here must match a rule defined there. Changing an expression, label, annotation, or `for` duration in that file will break the corresponding test case here.

## Notes

- The file is **not** a Prometheus config; it is a `promtool test` harness. It is never loaded by Prometheus itself.
- Run locally: `promtool test rules docker/observability/prometheus.alert-rules.test.yaml`.
- Quiet cases are intentional and load-bearing: they guard against regressions where, e.g., a 4xx spike accidentally trips `HighErrorRate` or a single deploy restart trips `ApiRestarting`.
- The `ScheduledJobStale` test uses `interval: 1d` to keep the sample count small while still crossing the 30-day threshold.
- Annotations in `exp_annotations` must match the rule file **exactly** (including markdown links and back-ticks), so a doc-link change in the rule requires a test update.
