---
source: docker/backup/maintenance.sh
sha256: ec6ab7b5a5b88c92fcb72c7efec7e3ccc9d2073c86796030e6a523db4c4b4f17
generated_at: 2026-10-14T06:48:38.194729+00:00
model: ollama:qwen3.8:27b
---

# docker/backup/maintenance.sh

## Purpose

Weekly restic repository upkeep, scheduled by supercronic via `BACKUP_CHECK_SCHEDULE`. It reclaims space from previously forgotten snapshots and reads a rotating slice of stored data to surface corruption well before a restore would be needed.

## Key elements

- **`maintain()`** — the single job body:
  - Exits silently (dormant) if `RESTIC_REPOSITORY` is unset.
  - Runs `restic prune` when `BACKUP_PRUNE` is `true` (the default). Skipped entirely when `false` (append-only repositories).
  - Runs `restic check --read-data-subset=<N>` where `<N>` is `BACKUP_CHECK_SUBSET` (default `5%`), reading a different slice each invocation.
- **`run_job maintenance maintain`** — standard harness call (from `common.sh`) that wraps the function with heartbeat signalling and error handling.
- **`source /usr/local/lib/backup/common.sh`** — provides `log`, `restic_run`, `run_job`, and heartbeat helpers.

## Relationships

None declared in the dependency graph. The script depends at runtime on the shared helpers in `common.sh` and on the `restic` CLI installed in the container image.

## Notes

- A failed maintenance run flips the shared heartbeat **red**; the *next* successful backup (not the next maintenance) clears it back to green.
- `BACKUP_PRUNE` defaults to `true`; set it to `false` for append-only repositories where `prune` would be refused.
- The subset percentage is intentionally small (5 %) so each week checks a different slice; a full `restic check` is *not* performed here.
- Design rationale lives in `docs/tools/backups.md#integrity-check`.
