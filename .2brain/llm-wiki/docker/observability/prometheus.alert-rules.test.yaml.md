---
source: docker/observability/prometheus.alert-rules.test.yaml
source_sha256: eb231fb2413fde3ad78520fca7bf07bcf731825d26dcb455201d79a7da0b9a1c
context_sha256: 26adb8f30118f9d87527019820c429bff757d65768e905c593b930a21e937cf6
generated_at: 2026-11-22T01:32:52.978588+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/prometheus.alert-rules.test.yaml

## Purpose
Unit tests for the Prometheus alert rules in `prometheus.alert-rules.yaml`, executed with `promtool test rules`. Each alert gets at least one firing case, plus "quiet" cases (expected empty `exp_alerts`) for rules whose expressions are easy to get wrong: error rate and p95 aggregate across series, the webhook rule joins sides with differing labels, and the stale-job rules read the `task` label.

## Key elements
- **Header/config**: `rule_files: prometheus.alert-rules.yaml`, `evaluation_interval: 1m`; every test uses `interval: 1m` with synthetic `input_series`.
- **Availability alerts**: `ApiDown`, `WorkerDown` (`up` = 0, critical, with `job`/`instance` labels); quiet when `up` is 1.
- **`HeldJobsStuck`**: `queue_held_jobs_oldest_age_seconds` series from both `api` and `worker` jobs for the same channel. Silent at 5m and fires at 20m with a single alert per `channel` (critical).
- **`ApiRestarting`**: driven by changes in `process_start_time_seconds`. Several restarts fire it; a single restart (a deploy) stays quiet.
- **Counter-increase alerts** (series jumping 0→1, fire at 6m; flat series stay quiet):
  - `PaymentAmountMismatch` (critical, label `field`)
  - `PaymentWebhookUnreadable` (critical, label `reason`)
  - `PaidOrderWithoutHold` (critical, label `stage`; the quiet case also includes a `ship` stage series and expects no alert)
  - `AccountExportFailing` (warning)
- **`PaymentWebhookFailing`**: fires on a 500 for route `/payments/webhook/:provider`. Quiet for a 400 on that route or a 500 on `/orders`.
- **`DependencyUnavailable`**: keyed on `dependency_up` and `dependency`. A database down for over a minute is critical. A queue down for over 5 minutes is warning. A one-sample blip stays quiet.
- **`HighErrorRate`**: 5xx series across routes `a` and `b` (500 and 502) against 200s. Fires as a warning at 15m with no per-route labels. A following quiet case uses client errors (404) only, which must not count as server faults.
- Each firing case asserts the exact `exp_labels` and `exp_annotations` (summary and description text).

## Relationships
- **`docker/observability/prometheus.alert-rules.yaml`**: the file under test, loaded via `rule_files`. Alert names, labels, severities and annotation text here must match it exactly.
- **`github/workflows/ci.yml`**: its `alert-rules` job runs `promtool test rules` on this file.

## Notes
- Annotation text is asserted verbatim, so any wording change in the rules file breaks these tests.
- Several annotation descriptions embed documentation references (for payments and inventory), and the tests assert that text too.
- Run locally: `promtool test rules docker/observability/prometheus.alert-rules.test.yaml`.
