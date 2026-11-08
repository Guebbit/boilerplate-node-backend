---
source: docker/observability/prometheus.alert-rules.test.yaml
sha256: 9075ca205605e8aabda7784431dfc59f2533a45f8443ac5b8387ee673810ea88
generated_at: 2026-11-08T02:22:37.594756+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.test.yaml

## Purpose

Unit-test file for `prometheus.alert-rules.yaml`, executed by `promtool test rules` in CI (the `alert-rules` job in `.github/workflows/ci.yml`). It verifies that each alert fires under the intended condition and, for the expressions most prone to subtle mistakes, that it stays quiet under a look-alike condition.

## Key elements

- **`rule_files`** – points to `prometheus.alert-rules.yaml` (relative to this file's directory).
- **`evaluation_interval: 1m`** – default cadence for all test blocks.
- **Per-alert firing tests** – one `input_series` block per alert (`ApiDown`, `ApiRestarting`, `PaymentAmountMismatch`, `PaidOrderWithoutHold`, `AccountExportFailing`, `DependencyUnavailable`, `HighErrorRate`, `ScheduledJobNeverSucceeded`, `ScheduledJobStale`, `HighP95Latency`) that drives the metric past its threshold and asserts `exp_alerts` with the expected labels and annotations.
- **Per-alert quiet tests** – for rules whose PromQL is easy to mis-write (error-rate 4xx flood, p95 histogram aggregation, stale-job `task`-label join, webhook label mismatch), an extra block asserts `exp_alerts: []`.
- **`ScheduledJobStale` test** – uses a 1-day `interval` and evaluates at `31d` to exercise the 30-day TTL-retention boundary.

## Relationships

- **`docker/observability/prometheus.alert-rules.yaml`** – the sole `rule_files` entry; this test file exercises every alert defined there and will fail in CI if the alert expression, threshold, `for` clause, or annotation text drifts from what the test expects.

## Notes

- The file is run with `promtool test rules docker/observability/prometheus.alert-rules.test.yaml` (path relative to repo root). The `rule_files` path is relative to *this file*, so it resolves to the sibling `prometheus.alert-rules.yaml`.
- Quiet cases exist only where the expression is genuinely tricky (aggregate across series, label-join, `task`-label read). Simple `up == 0` style alerts get only a firing case.
- The `HighErrorRate` quiet case specifically encodes the business rule that 4xx traffic (404, 401, 429) must **not** count toward the 5% 5xx threshold.
- `ScheduledJobStale` uses a 1-day evaluation interval (not 1m) to keep the 40-sample window covering 31 days; all other tests use 1-minute intervals.
- Annotation text in `exp_annotations` must match the YAML rule file character-for-character; a doc rewording will break this test.
