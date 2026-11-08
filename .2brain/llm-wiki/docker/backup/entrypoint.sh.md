---
source: docker/backup/entrypoint.sh
sha256: 431abb3ec68bc0790b9da83cb5da89033592eb48f915a010cbd36b30c6f10fae
generated_at: 2026-11-08T02:18:59.470479+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/entrypoint.sh

## Purpose

Container entrypoint for the `backup` service. It translates a set of environment-variable "knobs" into a crontab file, validates that crontab, then `exec`s into [supercronic](https://github.com/aptible/supercronic) as the long-running PID 1. The design rationale lives in `docs/tools/backups.md#the-knobs`.

## Key elements

- **`set -euo pipefail`** — fail fast on any error, unset variable, or pipe failure.
- **Crontab generation (three branches)**
  - `BACKUP_SERVER_MODE=true` → writes a single `backup-server-maintenance` line (default `0 4 * * 0`). Used by the second machine in `docker-compose.backup-server.yml`.
  - `BACKUP_REPOSITORY` is empty/unset → writes a comment-only crontab; the container idles in a healthy, dormant state.
  - Otherwise → writes two lines: `backup-job` (default hourly) and `backup-maintenance` (default `30 3 * * 0`).
- **`supercronic -test "$CRONTAB"`** — parse-checks the generated crontab so a malformed cron expression crashes the container immediately rather than silently never firing.
- **`exec supercronic …`** — replaces the shell with the cron daemon. Flags:
  - `-passthrough-logs` — job stdout/stderr go straight to the container log.
  - `-prometheus-listen-address 127.0.0.1:9746` — exposes `/health` on loopback for the Docker healthcheck.

## Relationships

No graph neighbors. External references: `docs/tools/backups.md#the-knobs` (design doc) and the supercronic project (runtime dependency).

## Notes

- The crontab path defaults to `/tmp/crontab` via `BACKUP_CRONTAB`; override only if you need to inspect it from another container.
- An empty `BACKUP_REPOSITORY` is **not** an error — it is a first-class "dormant" mode, analogous to leaving `ALERT_HEARTBEAT_URL` blank elsewhere.
- Because the script `exec`s, supercronic becomes PID 1; signals (e.g. `SIGTERM` on `docker stop`) are delivered directly to it.
- The `-test` invocation is a separate process from the `exec`ed one; a bad expression here produces a loud, non-zero exit (container restart) rather than a silent no-op.
