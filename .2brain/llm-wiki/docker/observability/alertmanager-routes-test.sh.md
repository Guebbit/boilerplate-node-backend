---
source: docker/observability/alertmanager-routes-test.sh
source_sha256: 676dcbe193b31e304cf78eabb02b4546d18b119371ece7818a848c8d22f88693
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:31:27.988180+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/alertmanager-routes-test.sh

## Purpose
A POSIX shell test script that verifies Alertmanager alert routing and inhibit rules. It renders the config template for several combinations of environment "knobs", validates each result with `amtool check-config`, and asserts which receiver each alert lands on with `amtool config routes test`. It then starts a real `alertmanager` daemon to check which alerts are inhibited. It is meant to run inside the `prom/alertmanager` image, which provides `amtool`, `alertmanager` and busybox. The header comment gives the invocation: mount the `docker/observability` directory read-only into the container and run this script with `sh` as the entrypoint (`prom/alertmanager:v0.34.1`).

## Key elements
- `render <NAME=value>...`: runs the render script with a clean environment (`env -i`, only `PATH` kept) and the given variables. It reads the config template and writes a rendered config plus a `secrets` directory under a temp work directory, then runs `amtool check-config` on the result.
- `expect <receiver> <label=value>...`: asserts via `amtool config routes test --verify.receivers` that an alert with those labels routes to the receiver. Otherwise it prints `FAIL` and exits 1.
- Routing scenarios:
  - **All knobs set**: `heartbeat` for `Watchdog`. `AlertmanagerNotificationsFailing` goes to the opposite channel (`integration=email` goes to `webhook`, `integration=webhook` goes to `email`). `ApiDown` critical goes to `email-and-webhook`, and `HighErrorRate` warning goes to `email`.
  - **Email only**, **webhook only** and **every knob empty**: unavailable channels fall back to the `null` receiver.
- Secret-from-file scenarios:
  - `NODE_SMTP_PASS_FILE`, `ALERT_WEBHOOK_URL_FILE` and `ALERT_HEARTBEAT_TOKEN_FILE` are read into files under the work directory's `secrets` folder.
  - A non-empty password file turns on `auth_password_file`. An empty password file leaves SMTP auth off.
  - An empty webhook file leaves the webhook route off.
  - A missing named file fails the render, names the file in stderr, and is not replaced by the plain variable.
  - Only one trailing newline is stripped from a secret.
- Special characters: values containing `/`, `&` and `'` must survive rendering.
- Inhibit-rules test: starts `alertmanager` on `127.0.0.1:19093` in the background, polls `/-/ready` for up to 10 seconds, and adds alerts with `amtool alert add`. It then checks `alert query --inhibited` and `alert query`.
  - `HighErrorRate`, `HighP95Latency`, `UnhandledRejections`, `QueueJobsParked`, `WebhookRetriesStalled` and `ApiRestarting` must be inhibited, given `DependencyUnavailable` (database and queue) and `ApiDown`.
  - `AuditSinkFailing` must stay active.

## Relationships
No graph neighbors are listed, so no interactions with other indexed files are recorded. The script invokes the render script and config template that sit beside it, but these are not graph neighbors.

## Notes
- It runs with `set -eu` and creates a temp dir with `mktemp -d`. The daemon is stopped by an `EXIT` trap, but the temp dir is not removed.
- `amtool` has no static test for inhibit rules, so the script uses a live daemon. It waits a fixed `sleep 3` for the alerts to settle.
- The daemon is started with `--cluster.listen-address=` (empty), which disables clustering.
- `AuditSinkFailing` is intentionally never muted, because a gap in the audit trail is real whatever the cause.
- On success it prints `alertmanager routing: ok`.
