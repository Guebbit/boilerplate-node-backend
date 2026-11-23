---
source: docker/backup/restore-drill.sh
generated_at: 2026-11-22T01:28:47.289328+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/backup/restore-drill.sh

## Purpose
A bash script that proves the latest backup can be restored and reports how long it took. It restores the newest database snapshot into a throwaway Mongo and compares per-collection counts with those saved at backup time. It then restores the newest files snapshot with verification and runs a partial `restic check`. It exits 0 only if every step passes, and it never touches the live database. The elapsed time is printed as the expected downtime on a bad day. The script's header comment points to a design document on the restore drill.

## Key elements
- **Config variables**: `DRILL_MONGO_HOST` (default `restore-drill-db`), `DRILL_MONGO_PORT` (27017), `DRILL_RESTORE_DIR` (`/restore`), `DRILL_RESTORE_FILES` (true), `DRILL_CHECK_SUBSET` (10%). `BACKUP_DATABASE` (default true) toggles the database part. `WORK` is a temp dir removed on exit.
- `fail`: logs `DRILL FAILED: <reason>` and exits 1.
- `wait_for_throwaway`: polls the throwaway Mongo over `/dev/tcp` for up to 60 tries, one second apart, and fails if it never answers.
- `latest_snapshot <tag>`: returns the newest restic snapshot id for the backup host and tag, or empty.
- `run_tag <snapshot>`: extracts the snapshot's `run:` tag, which pairs a dump with its counts snapshot.
- `restore_database`: streams `mongodump.archive` out of restic into `mongorestore --archive --oplogReplay` against the throwaway host.
- `compare_counts`: restores `counts.tsv` from the counts snapshot and counts the restored copy with `mongodump --archive=/dev/null`. It parses the output with `count_lines` and compares the two sets with `awk`.
- `restore_files`: restores the latest `files` snapshot to `RESTORE_DIR` with `--verify`. It is skipped, not failed, if no files snapshot exists.
- `drill`: orchestrates the steps. It checks that the repository is set, then runs the database restore and count comparison, the optional files restore, and `restic check --read-data-subset`.
- The last line logs `DRILL PASSED` with the elapsed time from the shell's `SECONDS` variable.

## Relationships
Sources a shared helper script at the fixed path `/usr/local/lib/backup/common.sh`. From it the script uses `log`, `restic_run`, `count_lines`, `RESTIC_REPOSITORY` and `BACKUP_HOST`. It needs `restic`, `jq`, `mongorestore`, `mongodump` and `awk` on the path. No dependency-graph neighbors are listed.

## Notes
- The snapshot tags used are `db`, `files`, `counts` and `run:<id>`. Restic ANDs tags inside one `--tag a,b`, so `--tag "counts,$run"` selects the counts snapshot of the same run as the dump.
- Count comparison allows drift of max(5, 1%) per collection, because the oplog replay can land writes made later in the dump window. A collection that is missing, or empty when it was expected to have documents, always fails. `local.*` namespaces are ignored.
- The drill only counts collections listed in the backup's saved counts. Extra collections in the restored copy are not flagged.
- The throwaway Mongo must have no auth and no published port. The script has no guard against pointing `DRILL_MONGO_HOST` at a live instance, so this relies on configuration.
- The script has no `set -e` of its own. Failures are handled through explicit `fail` calls, so any `set` options come from the sourced helper.
- The partial `restic check` reads only a subset of the repository data (default 10%), so it is a sampling check rather than a full verification.
