#!/usr/bin/env bash
# The second machine's upkeep, run by supercronic on BACKUP_SERVER_SCHEDULE. For every client
# repository on the server's own disk it runs `forget --prune` (the keep knobs) and
# `check --read-data-subset`. The app side of each client can only ADD (the server is append-only);
# this is the one place old snapshots are deleted, because it reaches the disk directly.
#
# Layout it expects:  /data/<client>/            the client's repository (rclone's `--private-repos` path)
#                     /clients/<client>/password  that repository's restic password
# One heartbeat for the whole run (BACKUP_HEARTBEAT_URL): red names the client that failed.
# Design: docs/tools/backup-server.md#upkeep
# shellcheck source=common.sh
source /usr/local/lib/backup/common.sh

DATA_DIR="${BACKUP_SERVER_DATA_DIR:-/data}"
CLIENTS_DIR="${BACKUP_SERVER_CLIENTS_DIR:-/clients}"

# Prunes and checks one client's repository.
maintain_client() {
    local client="$1"
    export RESTIC_REPOSITORY="$DATA_DIR/$client"
    export RESTIC_PASSWORD_FILE="$CLIENTS_DIR/$client/password"
    # No `--host`: every host label in the repository is the client's own; `--group-by host,paths`
    # keeps each stack's dump, counts and files as separate histories.
    # `&&`, not two lines: this runs inside `||` below, where bash ignores `set -e`.
    restic_run forget --group-by host,paths --prune \
        --keep-hourly "${BACKUP_KEEP_HOURLY:-24}" --keep-daily "${BACKUP_KEEP_DAILY:-7}" \
        --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}" \
        && restic_run check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
}

# Every client with both a repository and a password file; one failing never skips the others.
maintain_all() {
    local failed=() client
    for dir in "$CLIENTS_DIR"/*/; do
        client="$(basename "$dir")"
        [ -d "$DATA_DIR/$client" ] || { log "$client: no repository yet, skipping"; continue; }
        log "$client: prune and check"
        # The `||` is deliberate here: this loop must go on past one bad client, and reports at the end.
        (maintain_client "$client") || failed+=("$client")
    done
    [ "${#failed[@]}" -eq 0 ] || { log "failed: ${failed[*]}"; return 1; }
}

run_job server-maintenance maintain_all
