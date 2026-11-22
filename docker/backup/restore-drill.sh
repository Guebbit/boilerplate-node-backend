#!/usr/bin/env bash
# The restore drill: proves the latest backup restores, and says how long that took.
#   1. restore the latest database snapshot into a THROWAWAY Mongo (`mongorestore --oplogReplay`)
#   2. count every collection in the restored copy, compare with the counts saved at backup time
#   3. when Zammad was backed up: restore its dump into a THROWAWAY Postgres (`pg_restore`), count tickets
#      and users, compare with the counts saved at backup time
#   4. restore the latest files snapshot and verify every byte
#   5. `restic check --read-data-subset` on the repository
#   6. print the elapsed time: that is how long the shop is down on a bad day
# Exit 0 only when every step passed. Never touches a live database.
# Design: docs/operate/backups.md#the-restore-drill
# shellcheck source=common.sh
source /usr/local/lib/backup/common.sh

# The throwaway Mongo: a plain instance with no auth and no published port. Never the live one.
DRILL_HOST="${DRILL_MONGO_HOST:-restore-drill-db}"
DRILL_PORT="${DRILL_MONGO_PORT:-27017}"
RESTORE_DIR="${DRILL_RESTORE_DIR:-/restore}"
# The throwaway Postgres for Zammad's dump: trust auth, no published port, never the live one.
DRILL_HELPDESK_HOST="${DRILL_HELPDESK_HOST:-restore-drill-helpdesk-db}"
DRILL_HELPDESK_PORT="${DRILL_HELPDESK_PORT:-5432}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Fails the drill with a reason.
fail() {
    log "DRILL FAILED: $*"
    exit 1
}

# Waits until the throwaway Mongo accepts connections (a TCP connect; the compose healthcheck
# is the real gate, this only covers `docker run` without one).
wait_for_throwaway() {
    local tries=60
    until (exec 3<>"/dev/tcp/$DRILL_HOST/$DRILL_PORT") 2>/dev/null; do
        tries=$((tries - 1))
        [ "$tries" -gt 0 ] || fail "the throwaway Mongo at $DRILL_HOST:$DRILL_PORT never answered"
        sleep 1
    done
}

# Waits until the throwaway Postgres accepts connections, like `wait_for_throwaway` for Mongo.
wait_for_helpdesk_throwaway() {
    local tries=60
    until pg_isready -q -h "$DRILL_HELPDESK_HOST" -p "$DRILL_HELPDESK_PORT" -U postgres; do
        tries=$((tries - 1))
        [ "$tries" -gt 0 ] || fail "the throwaway Postgres at $DRILL_HELPDESK_HOST:$DRILL_HELPDESK_PORT never answered"
        sleep 1
    done
}

# The newest snapshot id with the given tag; empty when there is none.
latest_snapshot() {
    restic_run snapshots --host "$BACKUP_HOST" --tag "$1" --latest 1 --json | jq -r '.[0].id // empty'
}

# The `run:` tag of a snapshot, which pairs the dump with its counts.
run_tag() {
    restic_run snapshots "$1" --json | jq -r '.[0].tags[] | select(startswith("run:"))'
}

# Compares `name<TAB>count` files: $2 the restored copy's, $3 what the backup saw. $1 words the summary
# ("N <what> match, M do not"). A live dump window moves counts a little (the oplog replay lands later
# writes), so allow max(5, 1%) drift per name. A missing or emptied name always fails. Exit 1 on any miss.
compare_tables() {
    awk -F'\t' -v what="$1" '
        NR == FNR { actual[$1] = $2; next }
        {
            name = $1; want = $2 + 0
            if (name ~ /^local\./) next
            if (!(name in actual)) { printf "MISSING  %s (expected %d)\n", name, want; bad++; next }
            got = actual[name] + 0
            slack = want / 100; if (slack < 5) slack = 5
            diff = got > want ? got - want : want - got
            if (diff > slack || (want > 0 && got == 0)) { printf "MISMATCH %s expected %d got %d\n", name, want, got; bad++ }
            else { printf "ok       %s %d\n", name, got; good++ }
        }
        END { printf "%d %s match, %d do not\n", good, what, bad; exit bad > 0 }
    ' "$2" "$3"
}

# Step 1: restore the dump. `--oplogReplay` applies the operations recorded during the dump, so
# the copy is consistent across collections. https://www.mongodb.com/docs/database-tools/mongorestore/
restore_database() {
    local snapshot="$1"
    log "restoring database snapshot $snapshot into $DRILL_HOST"
    # `restic dump` streams the one file of the snapshot to stdout; mongorestore reads the archive from stdin.
    restic_run dump "$snapshot" mongodump.archive \
        | mongorestore --host "$DRILL_HOST" --port "$DRILL_PORT" --archive --oplogReplay \
            2>"$WORK/restore.log" || { tail -n 20 "$WORK/restore.log" >&2; fail "mongorestore failed"; }
}

# Step 2: counts. The restored copy is counted by dumping it to nowhere: mongodump reports
# "done dumping <ns> (N documents)" per collection, the same lines the backup saved.
compare_counts() {
    local counts_snapshot="$1"
    restic_run dump "$counts_snapshot" counts.tsv >"$WORK/expected.tsv"
    mongodump --host "$DRILL_HOST" --port "$DRILL_PORT" --archive=/dev/null 2>"$WORK/count.log" \
        || fail "could not count the restored copy"
    count_lines <"$WORK/count.log" >"$WORK/actual.tsv"
    compare_tables collections "$WORK/actual.tsv" "$WORK/expected.tsv" || fail "the restored counts differ from the backup's"
}

# Step 3: Zammad. The dump is restored into an empty database owned by the same role, with
# `--no-owner --no-privileges` so the throwaway needs none of the live roles; then tickets and users are
# counted and compared with what the backup saw. A live dump window moves the counts a little, so allow
# max(5, 1%), like the Mongo counts; an emptied table always fails.
# https://www.postgresql.org/docs/17/app-pgrestore.html
restore_helpdesk() {
    local dump_snapshot="$1" counts_snapshot="$2"
    log "restoring Zammad snapshot $dump_snapshot into $DRILL_HELPDESK_HOST"
    wait_for_helpdesk_throwaway
    psql -h "$DRILL_HELPDESK_HOST" -p "$DRILL_HELPDESK_PORT" -U postgres -v ON_ERROR_STOP=1 -q \
        -c "CREATE ROLE ${HELPDESK_USER} LOGIN" -c "CREATE DATABASE ${HELPDESK_DB} OWNER ${HELPDESK_USER}" \
        >/dev/null || fail "could not create the throwaway Zammad database"
    restic_run dump "$dump_snapshot" zammad.pgdump \
        | pg_restore -h "$DRILL_HELPDESK_HOST" -p "$DRILL_HELPDESK_PORT" -U postgres -d "$HELPDESK_DB" \
            --no-owner --no-privileges --exit-on-error 2>"$WORK/pg_restore.log" \
        || { tail -n 20 "$WORK/pg_restore.log" >&2; fail "pg_restore failed"; }
    restic_run dump "$counts_snapshot" helpdesk-counts.tsv >"$WORK/helpdesk-expected.tsv"
    helpdesk_counts "$DRILL_HELPDESK_HOST" "$DRILL_HELPDESK_PORT" postgres "$HELPDESK_DB" >"$WORK/helpdesk-actual.tsv" \
        || fail "could not count the restored Zammad copy"
    compare_tables "Zammad counts" "$WORK/helpdesk-actual.tsv" "$WORK/helpdesk-expected.tsv" ||
        fail "the restored Zammad counts differ from the backup's"
}

# Step 4: files. `--verify` re-reads every restored file and checks it against the repository.
restore_files() {
    local snapshot
    snapshot="$(latest_snapshot files)"
    [ -n "$snapshot" ] || { log "no files snapshot, skipping"; return 0; }
    log "restoring files snapshot $snapshot into $RESTORE_DIR"
    restic_run restore "$snapshot" --target "$RESTORE_DIR" --verify >"$WORK/files.log" \
        || { tail -n 20 "$WORK/files.log" >&2; fail "restoring the files failed"; }
}

# The whole drill.
drill() {
    [ -n "$RESTIC_REPOSITORY" ] || fail "BACKUP_REPOSITORY is empty: nothing to restore"
    local dump_snapshot counts_snapshot run
    if [ "${BACKUP_DATABASE:-true}" = true ]; then
        dump_snapshot="$(latest_snapshot db)"
        [ -n "$dump_snapshot" ] || fail "no database snapshot in the repository"
        run="$(run_tag "$dump_snapshot")"
        # restic ANDs the tags inside one `--tag a,b` and ORs separate `--tag` flags.
        counts_snapshot="$(restic_run snapshots --host "$BACKUP_HOST" --tag "counts,$run" --json | jq -r '.[0].id // empty')"
        [ -n "$counts_snapshot" ] || fail "no counts snapshot for $run"
        wait_for_throwaway
        restore_database "$dump_snapshot"
        compare_counts "$counts_snapshot"
    fi
    local helpdesk_snapshot helpdesk_counts_snapshot
    helpdesk_snapshot="$(latest_snapshot helpdesk-db)"
    if [ -n "$helpdesk_snapshot" ]; then
        helpdesk_counts_snapshot="$(restic_run snapshots --host "$BACKUP_HOST" --tag "helpdesk-counts,$(run_tag "$helpdesk_snapshot")" --json | jq -r '.[0].id // empty')"
        [ -n "$helpdesk_counts_snapshot" ] || fail "no Zammad counts snapshot for the latest Zammad dump"
        restore_helpdesk "$helpdesk_snapshot" "$helpdesk_counts_snapshot"
    else
        log "no Zammad snapshot (the helpdesk profile was never backed up), skipping"
    fi
    if [ "${DRILL_RESTORE_FILES:-true}" = true ]; then restore_files; fi
    log "checking a ${DRILL_CHECK_SUBSET:-10%} slice of the repository"
    restic_run check --read-data-subset="${DRILL_CHECK_SUBSET:-10%}" || fail "restic check failed"
}

drill
log "DRILL PASSED: restore and verification took ${SECONDS}s. That is the downtime on a bad day, plus your own reaction time."
