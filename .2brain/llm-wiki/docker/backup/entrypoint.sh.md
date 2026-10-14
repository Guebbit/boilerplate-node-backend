---
source: docker/backup/entrypoint.sh
sha256: 431abb3ec68bc0790b9da83cb5da89033592eb48f915a010cbd36b30c6f10fae
generated_at: 2026-10-14T06:48:22.955502+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/entrypoint.sh

## Purpose

Entrypoint for the `backup` Docker service. It translates a small set of environment-variable "knobs" into a crontab file, validates that crontab, then `exec`s **supercronic** as PID 1 to run the scheduled backup jobs. An empty `BACKUP_REPOSITORY` yields a dormant (no-op) container that still reports healthy.

## Key elements

- **`set -euo pipefail`** — fail fast on any unset variable, non-zero exit, or pipe error.
- **`CRONTAB`** (default `/tmp/crontab`) — path written by this script and consumed by supercronic.
- **Three-way branch on mode:**
  - `BACKUP_SERVER_MODE=true` → single `backup-server-maintenance` job on `BACKUP_SERVER_SCHEDULE` (default `0 4 * * 0`).
  - `BACKUP_REPOSITORY` is empty → crontab contains only a `# dormant` comment; container idles.
  - Otherwise → two jobs: `backup-job` on `BACKUP_SCHEDULE` (default `0 * * * *`) and `backup-maintenance` on `BACKUP_CHECK_SCHEDULE` (default `30 3 * * 0`).
- **`supercronic -test "$CRONTAB"`** — validates the generated crontab; a malformed cron expression aborts the container before it starts silently.
- **`exec supercronic …`** — replaces the shell with supercronic as the long-running process. Flags:
  - `-passthrough-logs` — job stdout/stderr go to the container log.
  - `-prometheus-listen-address 127.0.0.1:9746` — exposes `/health` on loopback for the Docker healthcheck.

## Relationships

No graph neighbors are recorded for this file. It is a leaf entrypoint: it reads environment variables, writes a temp file, and hands off to the external `supercronic` binary. The job scripts it schedules (`backup-job`, `backup-maintenance`, `backup-server-maintenance`) are referenced by name in the crontab but are resolved at runtime by supercronic, not by static import.

## Notes

- Design rationale lives in `docs/tools/backups.md#the-knobs`.
- The "empty `BACKUP_REPOSITORY` ⇒ dormant" pattern mirrors how an empty `ALERT_HEARTBEAT_URL` is treated elsewhere in the project: healthy but idle, no boot warning.
- `supercronic -test` is a deliberate fail-loud guard; if you add a new scheduled job, make sure its cron expression is valid or the container will crash-loop at startup.
- The health endpoint is bound to `127.0.0.1` only — it is not reachable from outside the container network.
