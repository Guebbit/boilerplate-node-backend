#!/usr/bin/env bash
# One backup run, in order:
#   1. the database dump streamed into restic (no gzip: restic deduplicates raw bytes)
#   2. the per-collection counts the dump reported, as a tiny snapshot of the same run
#   3. the uploads and the mail spool, as plain files
#   4. `restic forget` per the keep knobs (skipped when BACKUP_PRUNE=false)
# then the heartbeat goes green, or red with the reason. Run by supercronic on BACKUP_SCHEDULE.
# Design and failure behaviour: docs/tools/backups.md#one-run
# shellcheck source=common.sh
source /usr/local/lib/backup/common.sh

# Every snapshot of one run carries the same `run:` tag, so the drill can pair a dump with its counts.
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Step 1+2: the dump, then its counts.
backup_database() {
    write_mongo_config "$WORK"
    # The Database Tools spell TLS `--ssl` (mongosh spells it `--tls`).
    # `mongodump --oplog`: consistent across collections while writes continue. Full dumps only.
    # `--numParallelCollections=1`: the lightest read on the live database. `--archive` with no
    # file = stdout. The log (stderr) is kept: its "done dumping" lines are the counts.
    # https://www.mongodb.com/docs/database-tools/mongodump/
    local dump=(
        mongodump --host "$MONGO_HOST" --port "$MONGO_PORT"
        --ssl --sslCAFile "$MONGO_CA_FILE"
        --username "$MONGO_USER" --authenticationDatabase admin --config "$WORK/mongo.yaml"
        --oplog --archive --numParallelCollections=1
    )
    # `--stdin-from-command`: restic runs the command itself and refuses the snapshot when it
    # exits non-zero, so a half-written dump is never kept. The shell wrapper only redirects the log.
    # https://restic.readthedocs.io/en/stable/040_backup.html#reading-data-from-a-command
    restic_run backup --host "$BACKUP_HOST" --tag db --tag "run:$RUN_ID" \
        --stdin-from-command --stdin-filename mongodump.archive \
        -- bash -c '"$@" 2>"$0" || { c=$?; cat "$0" >&2; exit "$c"; }' "$WORK/dump.log" "${dump[@]}"
    cat "$WORK/dump.log" >&2
    count_lines <"$WORK/dump.log" >"$WORK/counts.tsv"
    [ -s "$WORK/counts.tsv" ] || { log "the dump reported no collections"; return 1; }
    restic_run backup --host "$BACKUP_HOST" --tag counts --tag "run:$RUN_ID" \
        --stdin --stdin-filename counts.tsv <"$WORK/counts.tsv"
}

# Step 3: durable files. The mail spool is the one directory of `storage` worth keeping; the
# rendered PDFs there are regenerable.
backup_files() {
    local paths=()
    [ -d "$UPLOADS_DIR" ] && paths+=("$UPLOADS_DIR")
    [ -d "$MAIL_SPOOL_DIR" ] && paths+=("$MAIL_SPOOL_DIR")
    [ "${#paths[@]}" -gt 0 ] || { log "no files to back up"; return 0; }
    restic_run backup --host "$BACKUP_HOST" --tag files --tag "run:$RUN_ID" "${paths[@]}"
}

# Step 4: drop what the keep knobs no longer want. Space is reclaimed by `prune`, weekly, in
# maintenance.sh. `--group-by host,paths`: the dump, the counts and the files are three groups,
# each with its own history; the run tag must not split them further.
# https://restic.readthedocs.io/en/stable/060_forget.html
forget_old() {
    [ "${BACKUP_PRUNE:-true}" = true ] || { log "BACKUP_PRUNE=false, not forgetting"; return 0; }
    restic_run forget --host "$BACKUP_HOST" --group-by host,paths \
        --keep-hourly "${BACKUP_KEEP_HOURLY:-24}" --keep-daily "${BACKUP_KEEP_DAILY:-7}" \
        --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}"
}

# The whole run, in order.
backup_run() {
    [ -n "$RESTIC_REPOSITORY" ] || { log "BACKUP_REPOSITORY is empty: dormant"; return 0; }
    ensure_repository
    if [ "${BACKUP_DATABASE:-true}" = true ]; then backup_database; fi
    backup_files
    forget_old
}

run_job backup backup_run
