---
source: docker/backup/backup.sh
sha256: dddbab26fc0ae19a33d109b092c7011b2d44b89aa7943b70bc2d7cda20926161
generated_at: 2026-10-14T06:47:18.999285+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/backup.sh

## Purpose

Orchestrates a single scheduled backup run: streams a `mongodump` into restic, records the per-collection counts from the dump log, backs up the uploads and mail-spool directories, then applies retention via `restic forget`. Scheduled by supercronic on `BACKUP_SCHEDULE`; the design and failure contract are documented in `docs/tools/backups.md#one-run`.

## Key elements

- **`RUN_ID`** — UTC timestamp (`YYYYmmddTHHMMSSZ`) used as a `run:` tag so the dump, counts, and files from one execution are pairable in restic.
- **`WORK`** — `mktemp -d` scratch directory, removed on `EXIT` via `trap`.
- **`backup_database()`** — Builds a `mongodump` command (`--oplog --archive --numParallelCollections=1`, TLS via `--ssl`) and pipes its stdout into `restic backup --stdin-from-command`. The stderr log is captured to extract per-collection "done dumping" lines into `counts.tsv`, which is itself backed up as a separate snapshot. Fails the whole run if no collections were reported.
- **`backup_files()`** — Collects `$UPLOADS_DIR` and `$MAIL_SPOOL_DIR` (if present) and backs them up as a single restic snapshot tagged `files`.
- **`forget_old()`** — Runs `restic forget --group-by host,paths` with `--keep-hourly/daily/weekly/monthly` knobs (env-overridable, defaults 24/7/4/6). Skipped when `BACKUP_PRUNE=false`.
- **`backup_run()`** — Top-level sequence: guards on `RESTIC_REPOSITORY`, calls `ensure_repository`, then `backup_database` (if `BACKUP_DATABASE` ≠ `false`), `backup_files`, `forget_old`.
- **`run_job backup backup_run`** — Entry point provided by `common.sh`; handles heartbeat (green/red) and any shared pre/post logic.

## Relationships

- Sources `/usr/local/lib/backup/common.sh` for `restic_run`, `write_mongo_config`, `count_lines`, `ensure_repository`, `log`, and `run_job`.
- No other graph neighbors are registered.

## Notes

- **No compression**: the raw `mongodump` archive is fed to restic directly because restic already deduplicates; adding gzip would be redundant.
- **`--ssl` vs `--tls`**: `mongodump` uses `--ssl`; `mongosh` uses `--tls`. Do not "fix" one to match the other.
- **Atomicity of the dump**: `--stdin-from-command` makes restic execute the mongodump and *refuse* the snapshot if it exits non-zero, so a partial dump is never stored. The bash wrapper only redirects stderr to the log file.
- **Retention grouping**: `--group-by host,paths` keeps the `db`, `counts`, and `files` snapshots in three independent retention histories; the `run:` tag must *not* be added to the group-by or it would fragment each group per run.
- **Space reclamation** (`restic prune`) is intentionally *not* done here; it runs weekly in `maintenance.sh`.
- **Dormant mode**: if `RESTIC_REPOSITORY` is unset/empty the script logs and exits 0 without doing anything.
- **Lightest read on a live DB**: `--numParallelCollections=1` is deliberate — it avoids hammering the production database with parallel collection reads.
