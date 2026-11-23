---
source: docker/backup/entrypoint.sh
generated_at: 2026-11-22T01:28:19.333640+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/backup/entrypoint.sh

## Purpose
Start script for the `backup` service container. It converts environment variables into a crontab, validates it, and then replaces itself with `supercronic` to run the scheduled jobs. When `BACKUP_REPOSITORY` is empty, it writes a comment-only crontab so the container idles but stays healthy, and no boot warning is printed. The script's header comment cites `docs/operate/backups.md#the-knobs` as the design reference. That path was reported as missing from this repository, so treat the citation as possibly stale.

## Key elements
- **`CRONTAB`**: path of the generated crontab. Defaults to `/tmp/crontab` and can be overridden with `BACKUP_CRONTAB`.
- **Server mode** (`BACKUP_SERVER_MODE=true`): writes a single `backup-server-maintenance` entry. The schedule is `BACKUP_SERVER_SCHEDULE`, default `0 4 * * 0`. This is the second machine's kit (`compose.backup-server.yaml`), which only prunes and checks.
- **Dormant mode** (`BACKUP_REPOSITORY` empty): writes only the comment `# dormant: BACKUP_REPOSITORY is empty`.
- **Normal mode**: writes two entries.
  - `backup-job` on `BACKUP_SCHEDULE`, default `0 * * * *` (hourly).
  - `backup-maintenance` on `BACKUP_CHECK_SCHEDULE`, default `30 3 * * 0`.
- **`supercronic -test "$CRONTAB"`**: parses the crontab and exits on failure, so a bad cron expression stops the container at startup.
- **`exec supercronic ...`**: runs with these flags:
  - `-passthrough-logs` sends job output straight to the container log.
  - `-prometheus-listen-address 127.0.0.1:9746` serves `/health` on loopback only, for the container healthcheck.

## Relationships
No graph neighbors. The script calls these commands by name, and their definitions are not visible here:
- `supercronic`
- `backup-job`
- `backup-maintenance`
- `backup-server-maintenance`

## Notes
- The mode checks run in order: server mode, then empty repository, then normal. `BACKUP_SERVER_MODE` takes precedence over an empty `BACKUP_REPOSITORY`.
- The script uses `set -euo pipefail`, and `exec` makes supercronic the container's main process.
- Only the literal value `true` enables server mode.
