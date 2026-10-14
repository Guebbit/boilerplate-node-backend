---
source: docker/backup/server-maintenance.sh
sha256: 385b426ea6ddff851fdb9ecc6c29b0f690d452101c59f3293e0399f94f11be19
generated_at: 2026-10-14T06:49:15.405937+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/server-maintenance.sh

## Purpose

Scheduled maintenance script (run by supercronic on `BACKUP_SERVER_SCHEDULE`) that prunes and integrity-checks every client's restic repository stored on the backup server's local disk. It is the **only** code path that deletes old snapshots, because the application side of each client is append-only and never issues `forget`.

## Key elements

- **`maintain_client <client>`** – Exports `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` for the given client, then runs:
  - `restic forget --group-by host,paths --prune` with the `--keep-hourly/daily/weekly/monthly` knobs (overridable via `BACKUP_KEEP_*` env vars, defaults 24/7/4/6).
  - `restic check --read-data-subset=…` (default 5 %).
  The two commands are joined with `&&` so a failed prune skips the check.
- **`maintain_all`** – Iterates `"$CLIENTS_DIR"/*/`, calls `maintain_client` in a subshell, and collects failures into a `failed` array without stopping. Returns non-zero (and logs the list) if any client failed.
- **`run_job server-maintenance maintain_all`** – Entry-point wrapper (from `common.sh`) that provides heartbeat reporting to `BACKUP_HEARTBEAT_URL`; a red heartbeat names the failing client.
- **Config vars** – `BACKUP_SERVER_DATA_DIR` (default `/data`) and `BACKUP_SERVER_CLIENTS_DIR` (default `/clients`) control the two required directories.

## Relationships

No dependency-graph neighbors are recorded for this file. It sources `/usr/local/lib/backup/common.sh` at runtime (not a tracked graph edge).

## Notes

- **Append-only guarantee:** the app can only *add* snapshots to a repository. This script is the sole place deletion happens, so a broken or skipped run causes unbounded disk growth.
- **`&&` is load-bearing:** the prune-and-check pair sits inside a `||` context where `set -e` is inactive; using a newline (implicit `;`) would let `check` run even after a failed `forget`.
- **No `--host` filter:** every host label in a client's repo belongs to that same client, so filtering by host would be redundant or wrong. `--group-by host,paths` preserves per-stack (host × path) snapshot histories independently.
- **Failure isolation:** `maintain_all` deliberately uses `( … ) || failed+=(…)` so one bad client never prevents the others from being serviced; the script only exits non-zero *after* the full sweep.
- **Directory contract:** a client is considered present only if **both** `"$CLIENTS_DIR/<client>/password` (via the glob) **and** `"$DATA_DIR/<client>"` exist. A repo without a password file is silently skipped.
