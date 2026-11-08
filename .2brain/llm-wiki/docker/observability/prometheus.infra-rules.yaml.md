---
source: docker/observability/prometheus.infra-rules.yaml
sha256: 29dd4676d42af9912f2947315374791b2b2a16d68687d75f973c0038e7c2d943
generated_at: 2026-11-08T02:23:29.881482+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.infra-rules.yaml

## Purpose

Defines Prometheus alert rules for the infrastructure surrounding the application — the alerting pipeline itself, the host filesystem, and the Traefik proxy. It is kept separate from app-level rules (`prometheus.alert-rules.yaml`) because the cross-cutting test `tests/cross-cutting/alert-rules-metrics.test.ts` rejects any `*_total` metric the app does not register, and these rules read Prometheus, Alertmanager, node_exporter, and Traefik metrics instead.

## Key elements

- **`alerting.rules` group**
  - `Watchdog` — `vector(1)`; always firing on purpose. Serves as a heartbeat sent to `ALERT_HEARTBEAT_URL`; the remote service raises the alarm when pings stop.
  - `AlertmanagerNotificationsFailing` — fires when `alertmanager_notifications_failed_total` increases over 15 min, grouped by integration. Routed to the *other* channel so a broken receiver cannot suppress its own failure alert.
  - `PrometheusRuleEvaluationFailures` — catches runtime rule-evaluation errors (bad joins, shape changes) that `promtool check rules` in CI would miss.

- **`host.rules` group**
  - `DiskAlmostFull` — single rule covering both a <10 % free-space threshold and a `predict_linear` trend (full within 24 h at the last 6 h rate). Filters out `tmpfs|ramfs|squashfs|overlay`. `for: 30m` tolerates transient compaction/backup spikes.

- **`proxy.rules` group**
  - `TlsCertExpiringSoon` — fires when a Traefik-managed certificate (`cn != "TRAEFIK DEFAULT CERT"`) has fewer than 14 days of validity. `for: 1h`.

## Relationships

- **`docker/observability/prometheus.production.config.yaml`** — the Prometheus configuration that loads this rules file via `rule_files` in the production compose stack. Without it, none of the groups here are evaluated.
- **`docker/observability/prometheus.traefik-scrape.yaml`** — defines the scrape job for Traefik's `/metrics` endpoint, which produces the `traefik_tls_certs_not_after` series consumed by the `TlsCertExpiringSoon` alert.

## Notes

- **Watchdog is not an error.** It is permanently firing by design; the alert fires on the *absence* of the ping at the remote end. Do not "fix" it by changing the expression.
- **Cross-routing.** `AlertmanagerNotificationsFailing` is delivered on a different receiver than the integration it monitors (see `alertmanager.config.template.yaml`). A failing email alert goes to the webhook and vice-versa.
- **Let's Encrypt email gap.** Since 2025-06-04 Let's Encrypt no longer sends expiry notification emails; `TlsCertExpiringSoon` is the only remaining expiry signal.
- **Test constraint.** Because `alert-rules-metrics.test.ts` enforces that only app-registered `*_total` metrics appear in rules, any new infra alert that needs a `*_total` must live in this file, not in `prometheus.alert-rules.yaml`.
