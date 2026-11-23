---
source: docker/backup/server-maintenance.sh
source_sha256: 3c1d3cf76633b554ebe6208b958fc587dc9ac17882e17b842d9cd816f0b794ad
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:29:02.100078+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/backup/server-maintenance.sh

## Purpose
Upkeep script for the backup server (the "second machine"), run by supercronic on `BACKUP_SERVER_SCHEDULE`. For every client repository on the server's local disk it runs `restic forget --prune` and `restic check --read-data-subset`. Clients can only add snapshots (the server is append-only), so this is the one place old snapshots are deleted, since it accesses the disk directly.

## Key elements
- **`DATA_DIR` / `CLIENTS_DIR`**: default to `/data` and `/clients`, overridable via `BACKUP_SERVER_DATA_DIR` and `BACKUP_SERVER_CLIENTS_DIR`.
- **`maintain_client <client>`**: exports `RESTIC_REPOSITORY=$DATA_DIR/<client>` and `RESTIC_PASSWORD_FILE=$CLIENTS_DIR/<client>/password`. It then runs `restic_run forget --group-by host,paths --prune` with keep flags, and, only if that succeeds (`&&`), `restic_run check --read-data-subset`.
  - Keep settings: `BACKUP_KEEP_HOURLY` (24), `BACKUP_KEEP_DAILY` (7), `BACKUP_KEEP_WEEKLY` (4), `BACKUP_KEEP_MONTHLY` (6).
  - Check subset: `BACKUP_CHECK_SUBSET` (5%).
- **`maintain_all`**: iterates over `$CLIENTS_DIR/*/`. It skips (with a log line) clients that have no directory under `$DATA_DIR`. Each client runs in a subshell, and failures are collected. At the end it logs `failed: ...` and returns 1 if any client failed.
- **`run_job server-maintenance maintain_all`**: the entry point, which wraps the whole run.

## Relationships
- Sources a shared helper library that provides `log`, `restic_run` and `run_job`. It has no graph neighbors.
- `run_job` reports one heartbeat for the whole run (`BACKUP_HEARTBEAT_URL`). A failure shows as red and names the failing client(s).
- Expects the layout `/data/<client>/` (the repository, rclone's `--private-repos` path) and `/clients/<client>/password`.

## Notes
- `--group-by host,paths` keeps each stack's dump, counts and files as separate retention histories. There is no `--host` filter, because every host label in a repository belongs to that client.
- `maintain_client` runs inside `|| ...`, where bash ignores `set -e`. That is why its two restic commands are chained with `&&` rather than written on separate lines.
- The `||` in `maintain_all` is deliberate: one bad client must not stop the others from being maintained.
- A client needs both a password file and a repository. A password directory without a repository is skipped, not counted as a failure.
