---
source: docker/backup/maintenance.sh
sha256: ec6ab7b5a5b88c92fcb72c7efec7e3ccc9d2073c86796030e6a523db4c4b4f17
generated_at: 2026-11-08T02:19:05.635173+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/maintenance.sh

## Purpose

Weekly repository upkeep job, scheduled by supercronic via `BACKUP_CHECK_SCHEDULE`. It reclaims freed space with `restic prune` (conditional on append-only repos) and verifies data integrity by reading a rotating slice of stored packs, so corruption surfaces weeks before a restore is needed.

## Key elements

- **`maintain()`** — the job body.
  - Exits early (dormant) if `RESTIC_REPOSITORY` is unset.
  - Calls `restic_run prune` only when `BACKUP_PRUNE` is `true` (the default).
  - Calls `restic_run check --read-data-subset=${BACKUP_CHECK_SUBSET:-5%}` to read a different data slice each run.
- **`run_job maintenance maintain`** — wraps `maintain()` with the shared heartbeat/failure-ping logic from `common.sh`.
- **`source /usr/local/lib/backup/common.sh`** — pulls in `restic_run`, `log`, `run_job`, and related helpers.

## Relationships

No graph neighbors are recorded for this file. It depends at runtime on `/usr/local/lib/backup/common.sh` (sourced) and the `restic` binary, both of which are external to the tracked dependency graph.

## Notes

- `BACKUP_PRUNE` defaults to `true` in the script logic (`:-true`), but an append-only restic repository will refuse the prune call; the variable exists to gate it explicitly.
- `BACKUP_CHECK_SUBSET` defaults to `5%`; the comment states that the subset rotates across weeks so a corrupted pack is eventually hit.
- A failed run turns the shared heartbeat red; the next successful backup restores it to green — this script shares the heartbeat with the primary backup job.
- The file is meant to be run as a job (via `run_job`), not invoked standalone with arbitrary arguments.
