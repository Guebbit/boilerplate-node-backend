---
source: docker/observability/prometheus.infra-rules.test.yaml
sha256: 8608f3a6945034f523d13667365aa70d66b0833f56cabcd81d66c9e581e10bd7
generated_at: 2026-11-08T02:23:16.493540+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.infra-rules.test.yaml

## Purpose

Unit-test suite for the alerting rules in `prometheus.infra-rules.yaml`, executed by `promtool test rules`. It provides one firing scenario and (where applicable) one quiet scenario per alert to catch regressions in rule expressions, label/annotation propagation, and threshold logic. Invoked from the `alert-rules` job in `.github/workflows/ci.yml`.

## Key elements

- **`rule_files`** — points to `prometheus.infra-rules.yaml`; the file whose rules are being exercised.
- **`evaluation_interval: 1m`** — global 1-minute step applied to every test block.
- **Watchdog test** — asserts the always-firing heartbeat alert fires immediately with `severity: none`.
- **AlertmanagerNotificationsFailing tests** — firing case: `alertmanager_notifications_failed_total` rises from 0 to 5; quiet case: all-zero values (`0x20`). Verifies the 15-minute counter threshold and the `integration` label.
- **PrometheusRuleEvaluationFailures tests** — firing and quiet cases mirroring the pattern above, keyed on `prometheus_rule_evaluation_failures_total` for a specific `rule_group`.
- **DiskAlmostFull tests** — four scenarios over a 2-hour window (120 samples):
  - Low free space (5 % of 100 GB) → fires.
  - Trending down (70 GB free, −100 MB/sample → projected full within 24 h) → fires.
  - Steady 50 % free + a full `tmpfs` mount → stays quiet (tmpfs excluded by design).
- **TlsCertExpiringSoon tests** — fires for a cert with 10 days remaining (`864000s`) while ignoring a 60-day cert and the Traefik default cert; quiet case with all certs > 14 days out.

## Relationships

- **`docker/observability_prometheus.infra-rules.test.yaml`** — graph-neighbor entry for this same test file (alternate path/alias); no separate code interaction.
- **`prometheus.infra-rules.yaml`** (loaded via `rule_files`) — the rule definitions under test; labels, annotations, and thresholds asserted here must stay in sync with that file.
- **`.github/workflows/ci.yml`** (`alert-rules` job) — CI entry point that shells out to `promtool test rules` against this file.

## Notes

- Run manually with: `promtool test rules docker/observability/prometheus.infra-rules.test.yaml`.
- Value shorthand `0x20` means "zero repeated 20 times"; `50000000000x120` means a constant 50 GB for 120 samples. The arithmetic form `70000000000-100000000x120` means "start at 70 GB, decrement by 100 MB each sample, 120 samples."
- The `for` duration on `DiskAlmostFull` requires the series to be present for the entire window; stale gaps would suppress the alert. Tests therefore feed continuous data for 120 minutes.
- The quiet disk case deliberately includes a `tmpfs` mount at 0 bytes free to lock in the rule's exclusion of tmpfs filesystems.
- When adding a new alert to `prometheus.infra-rules.yaml`, a corresponding firing **and** quiet test case must be added here or CI will not catch expression changes.
