---
source: docker/observability/prometheus.infra-rules.yaml
source_sha256: 49c45d54ace83cc1f8fa694bf6f148d21242f84fe0801380eaa7e62cc0c5ad44
context_sha256: 37482980c0e127adb09003ea756ac7685f0f1bfb8de8e55b802752b84985e0f5
generated_at: 2026-11-22T01:33:45.734570+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/prometheus.infra-rules.yaml

## Purpose
Prometheus rule file for alerts about the alerting pipeline itself and about the host. These rules read the metrics of Prometheus, Alertmanager and node_exporter, not the app's own metrics. They live apart from the app rules because `tests/cross-cutting/alert-rules-metrics.test.ts` rejects any `*_total` metric the app does not register. The file is mounted next to `prometheus.alert-rules.yaml` in both compose files. Routing is documented in `docs/operate/deployment-hardening.md#alert-routing`.

## Key elements
- **Group `alerting.rules`**
  - `Watchdog`: `expr: vector(1)`, severity `none`, always firing on purpose. Alertmanager pushes it to `ALERT_HEARTBEAT_URL` every minute. The external heartbeat service raises the alarm when the pings stop, which is how a dead host, Prometheus, Alertmanager or network gets noticed.
  - `AlertmanagerNotificationsFailing`: fires when `increase(alertmanager_notifications_failed_total[15m]) > 0`, summed by `integration`. Severity `warning`, `for: 0m`.
  - `PrometheusRuleEvaluationFailures`: fires when `increase(prometheus_rule_evaluation_failures_total[15m]) > 0`, summed by `rule_group`. Severity `warning`, `for: 0m`. It catches runtime evaluation errors that the static `promtool check rules` in CI cannot see.
- **Group `host.rules`**
  - `DiskAlmostFull`: a single rule, severity `warning`, `for: 30m`. It fires when either condition holds on a node_exporter filesystem:
    - Free space is under 10 %.
    - `predict_linear` over the last 6 hours says free space reaches 0 within 24 hours.
    - Filesystems of type `tmpfs`, `ramfs`, `squashfs` and `overlay` are excluded.

## Relationships
- `alertmanager.config.template.yaml`: receives these alerts and routes them. `AlertmanagerNotificationsFailing` goes to the other channel, so a failing email goes to the webhook and a failing webhook goes to email. `Watchdog` is pushed to the heartbeat URL.
- `prometheus.config.yaml`: Prometheus is configured to load this file.
- `prometheus.infra-rules.test.yaml`: the unit tests for these rules.
- `gatus.dev.config.yaml`: no interaction is visible in this file's content.

## Notes
- `Watchdog` is meant to fire constantly. Do not "fix" it.
- `AlertmanagerNotificationsFailing` is deliberately not routed to the broken receiver.
- `DiskAlmostFull` combines the percentage and trend conditions in one rule with `or`, so the two never double-alarm. The `for: 30m` rides out compactions and backups that borrow space.
- Keep non-app metrics in this file, not in the app rules file, so the `*_total` metric test does not reject them.
