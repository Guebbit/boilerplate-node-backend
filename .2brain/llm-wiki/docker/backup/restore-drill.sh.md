---
source: docker/backup/restore-drill.sh
sha256: bde576a6067590e9224788ff7881f3a55ae166f3d8b8693815232123febba018
generated_at: 2026-10-14T06:49:00.512075+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/restore-drill.sh

## Purpose

Performs a full restore drill against a **throwaway** MongoDB instance and a temp directory to prove the latest backup snapshots are actually restorable and byte-identical, then reports elapsed wall-clock time as the estimated shop-downtime on a bad day. Never touches the live database. Exits 0 only if every step passes.

## Key elements

- **`drill()`** — Top-level orchestrator. Resolves the latest `db` snapshot, finds its paired `counts` snapshot via the shared `run:` tag, restores the database, compares counts, restores files, and runs a `restic check --read-data-subset` slice.
- **`restore_database()`** — Streams a single-file `mongodump.archive` out of the restic repository and pipes it into `mongorestore --archive --oplogReplay` against the throwaway Mongo.
- **`compare_counts()`** — Dumps the restored copy to `/dev/null` to harvest per-collection document counts, then diffs them against the `counts.tsv` saved at backup time using an `awk` pass that allows `max(5, 1%)` drift per collection; missing or emptied collections always fail.
- **`restore_files()`** — Runs `restic restore --verify` into `$RESTORE_DIR`; re-reads every restored file and checks it against the repository. Skips gracefully if no `files` snapshot exists.
- **`wait_for_throwaway()`** — TCP-connects to the throwaway Mongo up to 60 s to cover `docker run` paths that lack a compose healthcheck.
- **`latest_snapshot()` / `run_tag()`** — Thin `restic snapshots … --json | jq` helpers for resolving snapshot IDs and pairing tags.
- **`fail()`** — Logs a `DRILL FAILED: …` message and exits 1.
- **Config via env vars** — `DRILL_MONGO_HOST` (default `restore-drill-db`), `DRILL_MONGO_PORT` (default `27017`), `DRILL_RESTORE_DIR` (default `/restore`), `DRILL_RESTORE_FILES` (default `true`), `DRILL_CHECK_SUBSET` (default `10%`), `BACKUP_DATABASE` (default `true`).

## Relationships

- **Sources** `/usr/local/lib/backup/common.sh` for shared helpers (`log`, `restic_run`, and presumably `count_lines`). No other files are imported or exported.

## Notes

- The throwaway Mongo is intentionally a plain instance with **no auth and no published port**; the script never connects to the live database.
- `--oplogReplay` is required so the restored copy is consistent *across* collections; without it, cross-collection references may be stale.
- The `local.` namespace is excluded from count comparison (MongoDB's internal collections are not part of the user data).
- Count drift tolerance (`max(5, 1%)`) exists because a live dump window can land a few extra writes after the oplog replay boundary.
- The script pairs the `db` snapshot with its `counts` snapshot using a shared `run:` tag; restic's tag semantics (AND within one `--tag a,b`, OR across separate flags) are relied upon here.
- Design rationale lives in `docs/tools/backups.md#the-restore-drill`.
- The final `log` line prints `${SECONDS}s` — the script measures its own total runtime with bash's built-in variable, not an external `time` command.
