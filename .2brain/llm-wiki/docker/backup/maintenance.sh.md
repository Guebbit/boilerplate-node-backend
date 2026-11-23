---
source: docker/backup/maintenance.sh
generated_at: 2026-11-22T01:28:29.247422+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/backup/maintenance.sh

## Purpose
Weekly repository upkeep script, run by supercronic on `BACKUP_CHECK_SCHEDULE`. It optionally prunes the restic repository and then verifies a rotating slice of the stored data, so a corrupted pack is detected well before a restore is needed. Design notes live in `docs/operate/health-checks.md#integrity-check`.

## Key elements
- `maintain()`: the job body.
  - Returns 0 with a "dormant" log message if `$RESTIC_REPOSITORY` is empty (the log message names `BACKUP_REPOSITORY`).
  - Runs `restic_run prune` when `BACKUP_PRUNE` is `true` (default `true`). This reclaims space released by `forget`.
  - Runs `restic_run check --read-data-subset=<BACKUP_CHECK_SUBSET>` (default `5%`). Each run reads a different slice of the data.
- `run_job maintenance maintain`: the script's only top-level action. It hands `maintain` to the shared job runner under the name `maintenance`.

## Relationships
No graph neighbors are listed. The script sources a shared helper library, `common.sh`, installed in the image under `/usr/local/lib/backup/`. The script calls `log`, `restic_run` and `run_job` and reads `$RESTIC_REPOSITORY`, none of which are defined in this file, so they presumably come from that library. The heartbeat behavior described below is likewise not implemented here.

## Notes
- Set `BACKUP_PRUNE=false` for an append-only repository, since such a repository refuses `prune`.
- A failure pings the same heartbeat red, and the next good backup turns it green again. The ping itself is handled outside this file.
- Configuration comes from the environment: `BACKUP_PRUNE`, `BACKUP_CHECK_SUBSET` and `BACKUP_CHECK_SCHEDULE`. The schedule is consumed by supercronic, not by this script.
