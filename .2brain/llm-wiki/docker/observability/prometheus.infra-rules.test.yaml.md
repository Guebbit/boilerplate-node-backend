---
source: docker/observability/prometheus.infra-rules.test.yaml
source_sha256: 1e9a0fc9f5f848d9a5327f9f435bb14c0d73b36034eae42d97f25dfab132cccf
context_sha256: ecf30b7599c01dfbd821fd5e8605370c3efc84b7a1d13ba84062d212bff97ec6
generated_at: 2026-11-22T01:33:32.658383+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/prometheus.infra-rules.test.yaml

## Purpose
Unit tests for the alert rules in `prometheus.infra-rules.yaml`, executed with `promtool test rules`. It provides one firing case per alert, plus a quiet (no-alert) case for the alerts that read a counter or could misfire on special filesystems.

## Key elements
- **Config:** `rule_files` points at `prometheus.infra-rules.yaml`; `evaluation_interval: 1m`; every test case uses `interval: 1m`.
- **Watchdog:** with no input series, at 1m it fires with `severity: none` and the "Alerting pipeline heartbeat" summary.
- **AlertmanagerNotificationsFailing:**
  - Fires at 6m with `severity: warning` and `integration: email` when `alertmanager_notifications_failed_total` rises (`0 0 0 1 2 3 4 5 5 5`).
  - Quiet at 15m when the counter stays flat (`0x20`).
- **PrometheusRuleEvaluationFailures:**
  - Fires at 6m with `severity: warning` and a `rule_group` label when `prometheus_rule_evaluation_failures_total` rises.
  - Quiet at 15m when the counter stays flat.
  - The test uses an example rule group value (`<path>/alerts.yml;api.rules`), which is just test input.
- **DiskAlmostFull** (evaluated at 2h, using `node_filesystem_avail_bytes` and `node_filesystem_size_bytes`):
  - Fires for `/` at 5% free of a 100 GB disk.
  - Fires for `/data` at 70% free but shrinking by 100 MB per minute, which covers the "full within 24 hours" trend condition.
  - Quiet for `/` at 50% free and steady, and for a `/run` tmpfs that has 0 bytes available.

## Relationships
- Loads and tests `prometheus.infra-rules.yaml`. The expected labels and annotations must match what that file defines.
- Run in CI by the `alert-rules` job in `github/workflows/ci.yml`, per the header comment.

## Notes
- Run locally with `promtool test rules docker/observability/prometheus.infra-rules.test.yaml`.
- The disk tests supply samples every minute because a sample older than five minutes goes stale, and the rule's `for` clause needs the series present throughout.
- The `/run` tmpfs case implies the rule excludes or ignores `tmpfs` filesystems. The exact filter is in the rules file.
- The DiskAlmostFull description, "under 10 % free, or will be full within 24 hours at the rate of the last 6 hours", describes the two conditions the tests cover.
