---
source: docker/backup/restore-drill.sh
sha256: bde576a6067590e9224788ff7881f3a55ae166f3d8b8693815232123febba018
generated_at: 2026-11-08T02:19:16.293699+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/restore-drill.sh

## Purpose
End-to-end restore verification script: restores the latest database and files snapshots into a throwaway environment, validates collection counts and file integrity, runs a partial `restic check`, and reports elapsed time as a proxy for worst-case shop downtime. Exits 0 only if every step succeeds. Never touches the live database.

## Key elements

- **`drill()`** — Top-level orchestrator. Resolves the latest `db`-tagged snapshot, finds its paired counts snapshot via the `run:` tag, then sequentially calls `restore_database`, `compare_counts`, `restore_files`, and `restic check --read-data-subset`.
- **`restore_database(snapshot)`** — Streams a `mongodump.archive` from restic into `mongorestore --oplogReplay` targeting the throwaway Mongo. Oplog replay ensures cross-collection consistency.
- **`compare_counts(counts_snapshot)`** — Dumps the restored copy to `/dev/null` via `mongodump` to harvest per-collection document counts, then `awk`-compares against the TSV saved at backup time. Tolerates up to `max(5, 1%)` drift per collection (oplog lag); a missing or zeroed collection always fails.
- **`restore_files()`** — Restores the latest `files`-tagged snapshot with `--verify` (byte-level re-read against the repository). Skipped gracefully if no files snapshot exists.
- **`latest_snapshot(tag)`** — Returns the restic snapshot ID with the newest timestamp for a given tag, or empty.
- **`run_tag(snapshot)`** — Extracts the `run:*` tag from a snapshot to pair a dump with its counts file.
- **`wait_for_throwaway()`** — TCP-connects to the throwaway Mongo up to 60 s before giving up.
- **`fail(msg)`** — Logs the reason and exits 1.
- **Configurable via env vars** — `DRILL_MONGO_HOST` (default `restore-drill-db`), `DRILL_MONGO_PORT` (default `27017`), `DRILL_RESTORE_DIR` (default `/restore`), `DRILL_RESTORE_FILES` (default `true`), `DRILL_CHECK_SUBSET` (default `10%`), plus inherited `RESTIC_REPOSITORY`, `BACKUP_HOST`, `BACKUP_DATABASE` from `common.sh`.

## Relationships

No graph-neighbor files are recorded. The script sources `/usr/local/lib/backup/common.sh` at runtime (provides `log`, `restic_run`) and references the design doc `docs/tools/backups.md#the-restore-drill`.

## Notes

- The throwaway Mongo is expected to have **no auth and no published port**; it is typically a sibling container (`restore-drill-db`) started by the calling compose profile.
- `restic` tag semantics matter here: multiple tags in one `--tag` flag are ANDed; separate `--tag` flags are ORed. The counts lookup exploits this (`--tag "counts,$run"`).
- The count comparison deliberately skips `local.*` namespaces (oplog, admin internals).
- Elapsed time is reported in seconds via bash's built-in `$SECONDS`; it is the "downtime" figure, not a CI metric.
- `WORK` is a `mktemp -d` directory cleaned up on any exit (trap), holding restore logs, expected/actual TSVs, and file-restore logs.
- The script is designed to be run *outside* the live container (it talks to Mongo over TCP), so it can be invoked from a separate drill container or CI job.
