---
source: docker/observability/alertmanager-routes-test.sh
sha256: e83d7f1fe40e012f9668dfe934eb3421fa8d0dcd1d7e85fed20678ca505f0d8a
generated_at: 2026-10-14T06:50:25.842157+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/alertmanager-routes-test.sh

## Purpose

Integration test that verifies Alertmanager's routing tree and inhibit rules against the rendered production config. It exercises every combination of the "knob" environment variables (email, webhook, heartbeat) to confirm alerts land on the correct receiver, confirms special characters survive template rendering, and boots a live Alertmanager daemon to prove inhibit rules suppress (and do not suppress) the right alerts.

## Key elements

- **`render`** — Invokes `alertmanager-render.sh` with a given set of `ENV=value` args into `$work/alertmanager.yml`, then validates the result with `amtool check-config`.
- **`expect`** — Wraps `amtool config routes test --verify.receivers` to assert a specific alert (label set) routes to the named receiver; prints a `FAIL` line and exits 1 on mismatch.
- **Scenario blocks** (top to bottom):
  - *all knobs set* — heartbeat → `heartbeat`, notification-failure → `webhook`, critical → `email-and-webhook`, warning → `email`.
  - *email only / webhook only / every knob empty* — verifies graceful degradation (unroutable alerts go to `null`).
  - *special characters* — renders with `/`, `&`, and `'` in values, then `grep`s the output YAML to confirm they are not mangled.
- **Inhibit-rules section** — Starts a real `alertmanager` on `127.0.0.1:19093`, waits for readiness via `wget` (busybox), pushes a battery of alerts with `amtool alert add`, then queries `--inhibited` vs. all active alerts to assert that `HighErrorRate`, `HighP95Latency`, `UnhandledRejections`, `QueueJobsParked`, `WebhookRetriesStalled`, `ApiRestarting` are inhibited while `AuditSinkFailing` remains active.

## Relationships

No graph neighbors are recorded. The script depends on two sibling files in the same directory (invoked at runtime, not via the dependency graph):

- `alertmanager-render.sh` — the template renderer called by `render`.
- `alertmanager.config.template.yaml` — the Jinja-like template that `alertmanager-render.sh` processes.

It also requires the `prom/alertmanager:v0.34.1` image, which supplies `amtool` and busybox `wget`.

## Notes

- Must run **inside** the Alertmanager container (`--entrypoint sh`); it is not a standalone host script.
- `set -eu` is the only guard; the script uses `trap … EXIT` only in the inhibit section to clean up the daemon.
- The readiness poll is a fixed 10×1 s loop with `wget -qO- …/-/ready`; there is no timeout beyond that.
- The inhibit test sleeps 3 s after adding alerts before querying — a deliberate wait for Alertmanager to apply the inhibit rules; if alert volume grows, this may need increasing.
- `render` uses `env -i PATH="$PATH"` so that the host environment does not leak extra variables into the template; only explicitly passed `NAME=value` args are visible to the renderer.
