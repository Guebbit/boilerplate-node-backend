#!/usr/bin/env bash
# Weekly upkeep of a repository, run by supercronic on BACKUP_CHECK_SCHEDULE:
#   - `restic prune` reclaims what `forget` released (only when BACKUP_PRUNE=true: an append-only
#     repository refuses it)
#   - `restic check --read-data-subset=N%` reads a different slice of the stored data each time,
#     so a corrupted pack is found weeks before the day it is restored
# A failure pings the same heartbeat red; the next good backup turns it green again.
# Design: docs/tools/backups.md#integrity-check
# shellcheck source=common.sh
source /usr/local/lib/backup/common.sh

# Reclaims space, then verifies a slice.
# https://restic.readthedocs.io/en/stable/045_working_with_repos.html#checking-integrity-and-consistency
maintain() {
    [ -n "$RESTIC_REPOSITORY" ] || { log "BACKUP_REPOSITORY is empty: dormant"; return 0; }
    if [ "${BACKUP_PRUNE:-true}" = true ]; then restic_run prune; fi
    restic_run check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
}

run_job maintenance maintain
