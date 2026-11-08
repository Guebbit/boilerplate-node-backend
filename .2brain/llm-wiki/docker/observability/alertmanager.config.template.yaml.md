---
source: docker/observability/alertmanager.config.template.yaml
sha256: 04e27741785f11f02af825fd495886431536d3fc2910fb4bbf6380ab4c21d21b
generated_at: 2026-11-08T02:21:33.128649+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/alertmanager.config.template.yaml

## Purpose

A Jinja-free, marker-based template for Alertmanager that is rendered into a live config at container startup. It exists because Alertmanager cannot read environment variables natively, so all operator-supplied knobs (SMTP credentials, webhook URLs, receiver names) must be baked in before the daemon reads the file. The routing logic itself is shared by every deployment; only the receiver values differ.

## Key elements

- **Template markers** — `@NAME@` is a placeholder substituted with the knob's value; `# BEGIN x` … `# END x` wraps a block that is deleted entirely when knob group `x` is empty (e.g. no SMTP → the whole `email_configs` section vanishes).
- **`route`** — groups by `alertname` (30 s wait, 5 min interval, 12 h repeat). Specific sub-routes handle:
  - **Watchdog** heartbeat (30 s cadence, no group wait) → dedicated receiver.
  - **`AlertmanagerNotificationsFailing`** with `integration="email"` → routed to the *other* channel (webhook) so a broken email path doesn't swallow its own failure alert.
  - **`AlertmanagerNotificationsFailing`** (any other integration) → routed to email for the same cross-channel reason.
  - **`severity="critical"`** → `email-and-webhook` receiver.
- **`receivers`** — five always-present receivers: `null` (safe sink when a knob is empty), `email`, `webhook`, `email-and-webhook` (both), `heartbeat` (webhook with optional Bearer-token auth). Secrets live on disk under `@SECRETS_DIR@`.
- **`inhibit_rules`** — suppresses secondary alerts when their root cause is already firing (e.g. `DependencyUnavailable[database]` mutes `HighErrorRate`, `HighP95Latency`, `UnhandledRejections`). `AuditSinkFailing` is deliberately excluded as a target.

## Relationships

- **`docker/observability/alertmanager-render.sh`** — renders this template: performs the `@NAME@` substitutions and strips `# BEGIN/# END` blocks whose knob groups are empty, producing the final YAML that the Alertmanager container reads.
- **`docs/tools/prometheus.md#alert-routing`** — the human-facing documentation for the routing decisions encoded here (referenced directly in the file header comment).

## Notes

- **Cross-channel failure reporting is intentional, not redundant.** An alert sent to its own broken channel is lost; the routing table deliberately sends `AlertmanagerNotificationsFailing` to the *opposite* receiver.
- **`null` is a receiver, not a keyword.** Every receiver block is always syntactically present so the rendered YAML stays valid; "no notification" is achieved by routing to `null`, not by omitting the receiver.
- **Inhibition labels use plain `=`** (no `equal:` keyword) because the project runs a single app instance; the comment in the file calls this out.
- **`require_tls`** is a bare boolean marker (`ALERT_SMTP_REQUIRE_TLS`) left as a template token—rendering must substitute a `true`/`false` literal, not a string.
