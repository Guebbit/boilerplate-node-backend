---
source: docker/backup/server-maintenance.sh
sha256: 385b426ea6ddff851fdb9ecc6c29b0f690d452101c59f3293e0399f94f11be19
generated_at: 2026-11-08T02:19:24.646086+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/server-maintenance.sh

## Purpose

Scheduled upkeep for the backup server's own disk. For every client repository it runs `restic forget --prune` (applying retention knobs) and `restic check --read-data-subset`. Because the app side can only append to the repository, this script is the **only** place where old snapshots are actually deleted. Triggered by supercronic via `BACKUP_SERVER_SCHEDULE`.

## Key elements

- **`maintain_client <client>`** — Exports `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` for one client, then chains `forget --group-by host,paths --prune` (with `--keep-hourly/daily/weekly/monthly` env overrides) `&& check --read-data-subset`. The `&&` is load-bearing: the call lives inside a `||` guard where `set -e` is suppressed.
- **`maintain_all`** — Iterates `$CLIENTS_DIR/*/`, skips clients that lack a repository under `$DATA_DIR`, runs `maintain_client` in a subshell guarded by `|| failed+=(…)`. Collects failures across all clients, logs them at the end, and returns 1 if any failed.
- **`run_job server-maintenance maintain_all`** — Entry point (defined in `common.sh`); handles the single heartbeat call to `BACKUP_HEARTBEAT_URL` and error reporting for the whole run.
- **`source /usr/local/lib/backup/common.sh`** — Provides `restic_run`, `log`, `run_job`, and shared shell settings.
- **Env-var overrides** — `BACKUP_SERVER_DATA_DIR` (default `/data`), `BACKUP_SERVER_CLIENTS_DIR` (default `/clients`), `BACKUP_KEEP_HOURLY/DAILY/WEEKLY/MONTHLY`, `BACKUP_CHECK_SUBSET` (default `5%`).

## Relationships

No dependency-graph neighbors are recorded for this file. It does source `/usr/local/lib/backup/common.sh` at runtime, which is the only external code dependency.

## Notes

- **`--group-by host,paths`** is deliberate: every host label in these repositories belongs to the client itself, and grouping by `host,paths` keeps each stack's dump, counts, and files as independent retention histories. Do **not** add `--host` filtering.
- The `||` around `(maintain_client …)` in the loop is intentional so one bad client never aborts the others; failures are batched into the final log line and exit code.
- The script assumes a strict on-disk layout (`/data/<client>/`, `/clients/<client>/password`). If a directory exists in one but not the other the client is skipped with a log message rather than an error.
- Design rationale lives in `docs/tools/backup-server.md#upkeep`.
