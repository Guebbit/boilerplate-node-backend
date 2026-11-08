---
source: docker/backup/backup.sh
sha256: dddbab26fc0ae19a33d109b092c7011b2d44b89aa7943b70bc2d7cda20926161
generated_at: 2026-11-08T02:18:19.972275+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/backup.sh

## Purpose

Executes a single, ordered backup run: a MongoDB dump streamed into restic, the resulting per-collection counts, the uploads and mail-spool directories, and a retention-pruning pass. Scheduled externally by supercronic via `BACKUP_SCHEDULE`; the script itself runs to completion and exits, updating a heartbeat (green/red) via the `run_job` wrapper.

## Key elements

- **`backup_database`** – Runs `mongodump` (with `--oplog`, `--archive` to stdout, single-collection parallelism) and pipes the archive into `restic backup --stdin-from-command`. Parses the "done dumping" lines from stderr into `counts.tsv`, then archives that file as a second snapshot. Uses `--tag db` / `--tag counts` and a shared `run:$RUN_ID` tag.
- **`backup_files`** – Collects `$UPLOADS_DIR` and `$MAIL_SPOOL_DIR` (if present) and archives them in one restic snapshot tagged `files` + `run:$RUN_ID`.
- **`forget_old`** – Runs `restic forget --group-by host,paths` with keep-hourly/daily/weekly/monthly knobs (overridable via `BACKUP_KEEP_*` env vars). Skipped when `BACKUP_PRUNE=false`.
- **`backup_run`** – Orchestrator: bails early if `RESTIC_REPOSITORY` is empty (dormant mode), ensures the repository exists, then calls the three steps in order. Honours `BACKUP_DATABASE` to skip the dump step.
- **`RUN_ID`** – UTC timestamp (`%Y%m%dT%H%M%SZ`) stamped as a restic tag on every snapshot of the run, so a dump and its counts can be paired later.
- **`WORK` temp dir + `trap … EXIT`** – Scratch space for the mongo config, dump log, and counts file; removed on any exit path.
- **`source /usr/local/lib/backup/common.sh`** – Provides `restic_run`, `write_mongo_config`, `count_lines`, `log`, `ensure_repository`, and `run_job`.

## Relationships

No graph-neighbor files are recorded. The only external dependency visible in the file is `/usr/local/lib/backup/common.sh` (sourced at the top).

## Notes

- **`mongodump` flags vs `mongosh`**: the script uses `--ssl` / `--sslCAFile` (Database Tools spelling), not `--tls`.
- **`--stdin-from-command` contract**: restic itself spawns the command and refuses to create a snapshot if the process exits non-zero, so a truncated dump is never stored. The `bash -c` wrapper only redirects stderr to the log file and propagates the exit code.
- **`--group-by host,paths`**: the three restic tags (`db`, `counts`, `files`) are treated as separate retention groups. The `run:` tag is intentionally *not* included in the group-by, so `forget` does not fragment history per run.
- **Space reclamation is separate**: `forget` only drops snapshot metadata; actual data deletion happens in `maintenance.sh` via a weekly `restic prune`.
- **Dormant mode**: if `RESTIC_REPOSITORY` is empty the script logs and returns 0 without touching restic at all—useful in dev environments where no backup host is configured.
- **Shellcheck**: the `# shellcheck source=common.sh` directive tells the linter where the sourced globals live; without it shellcheck will flag every `restic_run`, `log`, etc. as undefined.
