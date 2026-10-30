---
source: docker/observability/alertmanager-routes-test.sh
sha256: ed49298eef9f7fd0d765b1b62327c50e84a8e17e55e1ae0fb92aaebc2e62a33b
generated_at: 2026-10-29T01:18:34.907238+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/alertmanager-routes-test.sh

## Purpose

End-to-end test that verifies the rendered Alertmanager routing and inhibit rules work as intended for every combination of notification "knobs" (email, webhook, heartbeat). It renders the config template, validates it with `amtool check-config`, asserts receiver routing with `amtool config routes test`, and—because `amtool` has no static inhibit-rule check—spins up a live Alertmanager daemon to confirm which alerts are suppressed. Designed to run inside the `prom/alertmanager` image, which ships `amtool` and `busybox`.

## Key elements

- **`render …`** — Calls `alertmanager-render.sh` with the supplied `NAME=value` env vars to produce `$work/alertmanager.yml`, then immediately validates it via `amtool check-config`.
- **`expect <receiver> <label=value>…`** — Runs `amtool config routes test --verify.receivers=<receiver>` against the rendered config; exits 1 on a routing mismatch.
- **Knob-matrix tests** — Four render/expect blocks covering: all channels enabled, email-only, webhook-only, and no channels at all. Asserts that the correct receiver (`email`, `webhook`, `email-and-webhook`, or `null`) is selected for a set of representative alerts.
- **Special-character survival test** — Renders with addresses containing `/`, `&`, and `'`, then `grep`s the output YAML to confirm the values were not mangled.
- **Inhibit-rule test** — Starts `alertmanager` on a fixed local port, waits for readiness via `wget`, injects alerts with `amtool alert add`, and then queries `--inhibited` vs. active to verify that downstream alerts (HighErrorRate, QueueJobsParked, etc.) are suppressed while `AuditSinkFailing` remains active. Cleans up the daemon with a `trap … EXIT`.

## Relationships

- Invokes **`alertmanager-render.sh`** (same directory) and **`alertmanager.config.template.yaml`** (same directory) to produce the test config.
- Depends on the **`amtool`** binary and the **`alertmanager`** binary, both provided by the `prom/alertmanager:v0.34.1` Docker image.

## Notes

- Must be executed with `sh`, not `bash` (shebang is `#!/bin/sh`); the script relies on POSIX syntax only.
- The inhibit test is the slowest part: it starts a daemon, polls up to 10 s for readiness, injects alerts, then sleeps 3 s before querying. Total wall-time is roughly 5–15 s.
- The `trap … EXIT` only fires if the script reaches the inhibit section; earlier failures exit before the trap is set.
- The readiness poll uses `wget` (from busybox), not `curl`; the image is chosen specifically to include it.
- The script is idempotent and side-effect-free beyond the `mktemp -d` workdir, which is left in `/tmp` (intentional: the container is `--rm`).
