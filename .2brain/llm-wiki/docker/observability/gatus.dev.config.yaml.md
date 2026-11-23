---
source: docker/observability/gatus.dev.config.yaml
source_sha256: 543710350ff5bb9017775384c7760380cfa4fba42ebbd836dcedd0cc5c4ebc3e
context_sha256: c0bad8e2dd9411f921491314870c4f2f8c952658b70db58361c27e8bceae31c7
generated_at: 2026-11-22T01:31:57.896702+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/gatus.dev.config.yaml

## Purpose
Gatus configuration for the local Docker stack. It stands in for the off-host heartbeat service that production runs on another machine (`docs/operate/health-checks.md`), so the full alerting chain can be drilled locally. It differs from production only in where it mails (mailpit) and how fast. The production `/livez` and TLS checks are omitted because there is nothing to watch for them here.

## Key elements
- `storage: memory`: results are kept in memory only.
- `alerting.email`: sends from `gatus@example.test` to `ops@example.test` through the `mailpit` host on port 1025. TLS verification is skipped (`client.insecure: true`) so a STARTTLS offer never blocks delivery.
- `default-alert`: enabled, `failure-threshold: 1`, `send-on-resolved: true`.
- `external-endpoints` → `alertmanager-heartbeat` (group `dev`):
  - Authenticated with the token `dev-heartbeat-token`.
  - `heartbeat.interval: 3m`: if no ping arrives within 3 minutes, it is marked unhealthy and the email alert fires.
- `endpoints` → `alertmanager-healthy` (group `dev`):
  - Polls `http://alertmanager:9093/-/healthy` every 30s.
  - Expects `[STATUS] == 200`.
  - Has an email alert.

## Relationships
- Alertmanager's `Watchdog` alert pings the heartbeat endpoint every minute. The file says this is the dev default of `ALERT_HEARTBEAT_URL`, which is how the `docker/observability/alertmanager.config.template.yaml` side is wired to this file. The token here must match what that URL uses.
- `alertmanager-healthy` polls the `alertmanager` container directly, so it depends on that service's name and port 9093.
- `docker/observability/prometheus.infra-rules.yaml` is a neighbor in the graph. This file does not reference it directly. Gatus sits downstream of the Prometheus → Alertmanager → Watchdog chain that the heartbeat checks.

## Notes
- Drill: stop `alertmanager`. The `alertmanager-healthy` mail arrives almost immediately, and the heartbeat mail follows within about 3 minutes. Mails appear in mailpit at `http://localhost:8025`.
- `alertmanager-healthy` exists mainly because Gatus refuses to start without at least one plain endpoint. It also serves as a useful second signal in the drill.
- The token and addresses are dev-only placeholders (`example.test`).
