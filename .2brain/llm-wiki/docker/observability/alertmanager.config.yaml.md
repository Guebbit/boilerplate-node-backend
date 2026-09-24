---
source: docker/observability/alertmanager.config.yaml
sha256: cfdd6230582579ba9f268bb61f6799a91fcdd60a1c4b32d45f878f8fef2cfebc
generated_at: 2026-09-23T17:12:53.713056+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/alertmanager.config.yaml

## Purpose

Defines Alertmanager's alert-routing and notification policy for the local observability stack. It exists so that grouping, repeat, and resolve behavior lives in one place (Alertmanager) rather than being scattered across Prometheus, while the local default is deliberately silent—no external paging—yet the full routing pipeline stays active for later receivers.

## Key elements

- **`global.resolve_timeout` (5 m)** — how long Alertmanager waits after the last update before marking an alert resolved.
- **`route`** — top-level routing block: groups alerts by `alertname`, waits 30 s before dispatching a batch, re-batches every 5 m, and suppresses repeats for 12 h. All unmatched alerts fall through to the `null` receiver.
- **`receivers` → `null`** — a no-op receiver that discards notifications; intentionally wired so no Slack, email, or PagerDuty calls are made in the local baseline.
- **`inhibit_rules`** — explicitly empty; no suppression of one alert by another is defined in this baseline.

## Relationships

- **`docker/observability/prometheus.config.yaml`** — Prometheus evaluates its alert rules and pushes fired/resolved alerts to Alertmanager; this file is the sole consumer of that alert stream and decides (or declines) to notify.
- **`docker/observability/loki.config.yaml`** — Sibling config in the same `docker/observability/` stack. No direct data flow between Loki and Alertmanager; both are independent services that a dashboard (e.g. Grafana) typically queries alongside Prometheus/Alertmanager.

## Notes

- The `null` receiver is intentional, not a placeholder. Before adding a real receiver (Slack webhook, email, etc.), confirm the `route.receiver` default and any child routes are updated so you don't accidentally start paging.
- `group_by` is limited to `alertname`; alerts with the same name but different labels (e.g. different `instance`) will still be batched together. Add labels here if finer grouping is needed.
- The 12 h `repeat_interval` is aggressive for local development—re-alerts are quiet for half a day. Reduce it if you expect long outages and want a reminder.
- Adding inhibition rules requires filling the currently-empty `inhibit_rules` list; there is no partial/implicit inheritance.
