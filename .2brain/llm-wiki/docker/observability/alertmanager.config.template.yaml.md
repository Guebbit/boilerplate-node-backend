---
source: docker/observability/alertmanager.config.template.yaml
source_sha256: 0ea180c8947931f752823576d8ea60bd3c7642f31f5d1a3fc63397641b61e491
context_sha256: 87237a43de47797e17c483ff5fd83a17719b731d09eaf4a9ea04673ddfb7b8f7
generated_at: 2026-11-22T01:31:45.242876+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/alertmanager.config.template.yaml

## Purpose
Template for the Alertmanager configuration, rendered at container start by `alertmanager-render.sh`. A template is needed because Alertmanager reads no env vars and its email `to`/`from`/`smarthost` have no `_file` form, so values are substituted before the daemon starts. Routing is the same for every client; only the knobs differ. Further docs are referenced at `docs/operate/deployment-hardening.md#alert-routing`.

## Key elements
- **Template markers**
  - `@NAME@` is replaced by the knob's value.
  - `# BEGIN x` .. `# END x` blocks are deleted when knob group `x` is empty. Groups used: `email`, `smtp-auth`, `webhook`, `heartbeat`, `heartbeat-auth`.
- **`global`**: `resolve_timeout: 5m`.
- **`route`**: groups by `alertname` (wait 30s, interval 5m, repeat 12h). The default receiver is `@RECEIVER_DEFAULT@`. Sub-routes, in order:
  - `Watchdog` goes to `@RECEIVER_WATCHDOG@` (the heartbeat), with a 0s wait, 30s group interval and 1m repeat.
  - `AlertmanagerNotificationsFailing` with `integration="email"` goes to `@RECEIVER_NOTIFY_FAILING@`.
  - `AlertmanagerNotificationsFailing` for any other integration goes to `@RECEIVER_DEFAULT@` (email).
  - `severity="critical"` goes to `@RECEIVER_CRITICAL@`.
- **`receivers`**: all are always defined, and an emptied receiver notifies no one.
  - `null`: notifies no one.
  - `email`: SMTP settings from `@ALERT_EMAIL_TO@`, `@ALERT_EMAIL_FROM@`, `@ALERT_SMTP_HOST@`, `@ALERT_SMTP_PORT@` and `ALERT_SMTP_REQUIRE_TLS`. The optional `smtp-auth` group adds username and `auth_password_file`.
  - `webhook`: `url_file` from `@SECRETS_DIR@/webhook-url`.
  - `email-and-webhook`: both of the above.
  - `heartbeat`: webhook to `@SECRETS_DIR@/heartbeat-url`, with optional Bearer auth from `heartbeat-token`.
- **`inhibit_rules`**:
  - `DependencyUnavailable` for the database mutes `HighErrorRate`, `HighP95Latency` and `UnhandledRejections`.
  - `DependencyUnavailable` for the queue mutes `QueueJobsParked` and `WebhookRetriesStalled`.
  - `ApiDown` mutes `ApiRestarting`.

## Relationships
The alert names matched here (`Watchdog`, `AlertmanagerNotificationsFailing`, `DependencyUnavailable`, and so on) are the alerts that Prometheus fires. They are presumably defined in `prometheus.alert-rules.yaml` and `prometheus.infra-rules.yaml`, and Prometheus is pointed at Alertmanager through `prometheus.config.yaml` and `prometheus.production.config.yaml`. The file content itself does not show these links. No interaction with `loki.config.yaml` or `gatus.dev.config.yaml` is visible here.

## Notes
- The routes work around broken notification channels. An alert about a failing channel must not be sent through that channel. Email failures are reported via the webhook, and any other channel failure (including the heartbeat) is reported by email.
- `ALERT_SMTP_REQUIRE_TLS` in `require_tls` has no `@` delimiters, unlike the other knobs. Whether the renderer handles it differently is not visible here.
- `AuditSinkFailing` is deliberately never an inhibit target, because a gap in the audit trail is real whatever the cause.
- Inhibit rules have no `equal` labels, because there is only one app.
- The `Watchdog` heartbeat is always firing and pushed every minute. Silence at the receiving end means the stack is down.
