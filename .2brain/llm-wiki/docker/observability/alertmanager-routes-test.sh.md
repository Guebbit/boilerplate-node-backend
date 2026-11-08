---
source: docker/observability/alertmanager-routes-test.sh
sha256: ed49298eef9f7fd0d765b1b62327c50e84a8e17e55e1ae0fb92aaebc2e62a33b
generated_at: 2026-11-08T02:21:18.083239+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/alertmanager-routes-test.sh

## Purpose

End-to-end test script that verifies Alertmanager alert routing, inhibition rules, and config-rendering correctness. It exercises every combination of notification-channel environment knobs (email, webhook, heartbeat), confirms which receiver each alert lands on, and—where `amtool` has no static test—spins up a real Alertmanager daemon to verify inhibit rules actually suppress the expected alerts. Designed to run inside the `prom/alertmanager` image, which ships `amtool`, `alertmanager`, and `busybox`.

## Key elements

- **`render <ENV=value>…`** — Invokes `alertmanager-render.sh` to produce a concrete `alertmanager.yml` from the YAML template and the given environment, then validates the result with `amtool check-config`. Fails immediately if validation fails.
- **`expect <receiver> <label=value>…`** — Calls `amtool config routes test --verify.receivers` against the rendered config and asserts the alert routes to the expected receiver. Prints a `FAIL` message and exits 1 on mismatch.
- **Knob-combination scenarios** — Four rendering passes (all channels, email-only, webhook-only, all-empty) each followed by a battery of `expect` calls covering `Watchdog`, `AlertmanagerNotificationsFailing`, `ApiDown`, and `HighErrorRate`.
- **Special-character survival check** — Renders with an email address containing `/` and `&` and a display name with `'`, then `grep`s the output YAML to confirm the values were not mangled.
- **Inhibit-rule integration test** — Starts a real `alertmanager` daemon on `127.0.0.1:19093`, waits for readiness via `wget`, injects a set of critical/warning alerts with `amtool alert add`, sleeps 3 s, then queries `amtool alert query --inhibited` and `amtool alert query` to assert the correct alerts are suppressed (e.g. `HighErrorRate`, `QueueJobsParked`) while `AuditSinkFailing` must remain active.
- **`trap … EXIT`** — Ensures the backgrounded daemon is killed on any exit path.

## Relationships

The dependency graph records no neighbors. At runtime the script depends on two local files it loads explicitly: `alertmanager-render.sh` (config renderer) and `alertmanager.config.template.yaml` (the Jinja-like template). Both live in the same `docker/observability/` directory and are passed as positional arguments to the renderer.

## Notes

- Must run **inside** the `prom/alertmanager` image (`docker run --entrypoint sh …`); it relies on `amtool`, `alertmanager`, `wget` (busybox), and `sh` being preinstalled.
- Uses POSIX `sh` (not bash) and `set -eu`; no `set -o pipefail` equivalent exists in `sh`, so pipeline failures are handled via explicit `|| { …; exit 1; }` guards.
- The inhibit test is timing-sensitive: it polls readiness for up to 10 s and then sleeps a fixed 3 s before querying. In a heavily loaded CI container the 3 s window may be insufficient for Alertmanager to evaluate inhibition.
- `amtool config routes test` (static) does **not** evaluate inhibit rules; that is why the live-daemon section exists.
- The script is intentionally idempotent and stateless per invocation: it `mktemp -d`s a scratch dir and cleans up via the EXIT trap.
