---
source: docker/backup/backup.sh
generated_at: 2026-11-22T01:27:26.521400+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/backup/backup.sh

## Purpose
One backup run for the stack, executed by supercronic on `BACKUP_SCHEDULE`. It streams a MongoDB dump into restic, stores the dump's per-collection counts as a small snapshot, backs up the uploads and mail spool as plain files, then applies retention with `restic forget`. The heartbeat goes green on success, or red with the reason. Design and failure behaviour are described in a separate backups document referenced from the file header.

## Key elements
- **`RUN_ID` / `WORK`**: `RUN_ID` is a UTC timestamp, used as a `run:<id>` tag on every snapshot of the run so a dump can be paired with its counts. `WORK` is a temp dir removed on exit via `trap`.
- **`backup_database`** (steps 1 and 2):
  - Writes the Mongo config into `$WORK` with `write_mongo_config`.
  - Runs `mongodump` over TLS (`--ssl`, `--sslCAFile`) with `--oplog --archive --numParallelCollections=1`. The archive goes to stdout, uncompressed so restic can deduplicate it.
  - Passes the dump to `restic backup --stdin-from-command` as `mongodump.archive`, tagged `db`. restic refuses the snapshot if the command exits non-zero, so a partial dump is never kept.
  - The dump's stderr goes to `$WORK/dump.log`. It is replayed to stderr, and `count_lines` turns it into `counts.tsv`.
  - Fails if `counts.tsv` is empty ("the dump reported no collections"). Otherwise stores it as a second snapshot, tagged `counts`, via `--stdin`.
- **`backup_files`** (step 3): backs up `$UPLOADS_DIR` and `$MAIL_SPOOL_DIR` when they exist, tagged `files`. It logs "no files to back up" and returns 0 if neither exists.
- **`forget_old`** (step 4): runs `restic forget --group-by host,paths` with the `BACKUP_KEEP_HOURLY/DAILY/WEEKLY/MONTHLY` knobs (defaults 24/7/4/6). It is skipped when `BACKUP_PRUNE=false`.
- **`backup_run`**: the orchestrator.
  - Returns 0 as "dormant" (logging that `BACKUP_REPOSITORY` is empty) if `$RESTIC_REPOSITORY` is empty.
  - Calls `ensure_repository`.
  - Runs `backup_database` unless `BACKUP_DATABASE` is not `true`.
  - Then runs `backup_files` and `forget_old`.
- The last line, `run_job backup backup_run`, hands the run to the shared job wrapper.

## Relationships
No graph neighbors. The script sources a shared helper library, `common.sh`, installed under `/usr/local/lib/backup/`. That library supplies `restic_run`, `write_mongo_config`, `count_lines`, `ensure_repository`, `log` and `run_job`. `run_job` is presumably where the heartbeat is handled, but that code is not visible here. The header comment mentions that a weekly `prune` runs in a separate maintenance script.

## Notes
- `forget` only removes snapshots from the history. Disk space is reclaimed by the weekly `prune` in the maintenance script.
- `--group-by host,paths` keeps the dump, the counts and the files as three separate histories. Grouping by the `run:` tag would split them further, so it is deliberately left out.
- Only the mail spool inside `storage` is backed up. The rendered PDFs there are regenerable.
- The Database Tools use `--ssl`, whereas mongosh uses `--tls`.
- The `bash -c` wrapper in the dump command only redirects the log to a file. On failure it prints the log to stderr and re-exits with the dump's exit code.
- Only full dumps are supported with `--oplog`.
