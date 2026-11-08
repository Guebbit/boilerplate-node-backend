---
source: docker/observability/gatus.dev.config.yaml
sha256: 05b09f66051702d25551f71fec286a936b7219ebdc29c971491f0f7b97013a17
generated_at: 2026-11-08T02:21:44.731155+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/gatus.dev.config.yaml

## Purpose

Local Gatus configuration that stands in as the off-host heartbeat service for the Alertmanager alert-routing chain described in `docs/tools/prometheus.md#alert-routing`. It lets the full ping → detect → email path be drilled on one machine, with Mailpit as the mail sink instead of a production SMTP relay.

## Key elements

- **`storage.type: memory`** — all state is in-process; nothing persists across restarts.
- **`alerting.email`** — SMTP to `mailpit:1025`, sender `gatus@example.test`, recipient `ops@example.test`. `client.insecure: true` skips certificate verification because Mailpit offers STARTTLS without a trusted cert.
- **`alerting.email.default-alert`** — `failure-threshold: 1` (one missed beat triggers email), `send-on-resolved: true` (recovery notification also sent).
- **`external-endpoints[0]` → `alertmanager-heartbeat`** — heartbeat endpoint Alertmanager's Watchdog pings every minute (dev default of `ALERT_HEARTBEAT_URL`). No ping within `interval: 3m` marks it unhealthy and fires the email alert. Authenticated via `token: 'dev-heartbeat-token'`.
- **`endpoints[0]` → `alertmanager-healthy`** — plain HTTP GET to `http://alertmanager:9093/-/healthy` every 30 s, expecting `200`. Exists partly because Gatus refuses to start with zero plain endpoints, and partly as an immediate second signal (its alert email arrives right away vs. the ~3 min heartbeat email).

## Relationships

- **`docker/observability/alertmanager.config.template.yaml`** — Alertmanager's Watchdog component sends the periodic ping that this file's `alertmanager-heartbeat` endpoint consumes. The token in this file must match the `ALERT_HEARTBEAT_TOKEN` the template sets.
- **`docs/tools/gatus.md`** — documents the *production* Gatus deployment (separate host, TLS, `/livez` checks). This file is the local variant; that doc is the canonical reference for the full feature set.
- **`docs/tools/prometheus.md`** — the `#alert-routing` section points here as the local heartbeat receiver in the alerting chain.

## Notes

- The production example's `/livez` and TLS endpoints are intentionally omitted — there is nothing to watch for in a single-machine dev stack.
- Drill procedure: `docker stop alertmanager` → within ~3 min Mailpit (http://localhost:8025) receives the heartbeat-missing email. The `alertmanager-healthy` plain-endpoint email arrives within ~30 s, giving a second, faster signal.
- The heartbeat token is a hardcoded dev secret (`dev-heartbeat-token`), not sourced from an env var or secret manager.
