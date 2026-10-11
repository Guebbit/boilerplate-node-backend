#!/usr/bin/env bash
# Shared by the backup scripts: the knobs with their defaults, restic's environment, the heartbeat,
# and the parser for the per-collection counts. Sourced, never run. Design: docs/tools/backups.md
#
# Knobs (docs/tools/backups.md#the-knobs):
#   BACKUP_REPOSITORY      any restic repository. Empty = dormant, nothing runs.
#   BACKUP_DATABASE        true | false. false when the database is not in this stack.
#   BACKUP_PRUNE           true | false. false when the repository is append-only (no `forget`).
#   BACKUP_KEEP_HOURLY / _DAILY / _WEEKLY / _MONTHLY   snapshots to keep.
#   BACKUP_HEARTBEAT_URL / _TOKEN                      off-host freshness check (Gatus external endpoint).
#   BACKUP_HOST            the restic `--host` label; one stack = one host.
#   restic_repository_env  secret file of `NAME=value` lines: RESTIC_REST_USERNAME / _PASSWORD, AWS_* keys.

set -euo pipefail

# restic reads these itself. https://restic.readthedocs.io/en/stable/040_backup.html#environment-variables
export RESTIC_REPOSITORY="${BACKUP_REPOSITORY:-}"
export RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/run/secrets/restic_password}"
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-/cache}"

# The repository's own login (REST server user and password, S3 keys) as `NAME=value` lines in a
# secret file, so none of it sits in the container's environment where `docker inspect` shows it.
# Empty for a local disk. https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html
REPOSITORY_ENV_FILE="${BACKUP_REPOSITORY_ENV_FILE:-/run/secrets/restic_repository_env}"
if [ -s "$REPOSITORY_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$REPOSITORY_ENV_FILE"
    set +a
fi

# This stack's label on every snapshot. `restic forget` groups by it, so two stacks sharing a
# repository never prune each other.
BACKUP_HOST="${BACKUP_HOST:-${COMPOSE_PROJECT_NAME:-stack}}"

# Where the app's durable files are mounted, read-only.
UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-/data/uploads}"
MAIL_SPOOL_DIR="${BACKUP_MAIL_SPOOL_DIR:-/data/storage/mail-spool}"

# Wait for a busy repository's lock instead of failing: a prune on the other side holds it briefly.
LOCK_WAIT="${BACKUP_LOCK_WAIT:-10m}"

# The database login: the `backup` role, never root. TLS against the stack's own CA.
MONGO_HOST="${BACKUP_MONGO_HOST:-database}"
MONGO_PORT="${BACKUP_MONGO_PORT:-27017}"
MONGO_USER="${MONGO_BACKUP_USER:-backup}"
MONGO_PASSWORD_FILE="${MONGO_BACKUP_PASSWORD_FILE:-/run/secrets/mongo_backup_password}"
MONGO_CA_FILE="${BACKUP_MONGO_CA_FILE:-/ca-dir/mongo-ca.crt}"

# Prints one timestamped line. Goes to the container log, which Alloy ships.
log() {
    printf '%s [backup] %s\n' "$(date -u +%FT%TZ)" "$*"
}

# restic with the repository lock wait applied.
# https://restic.readthedocs.io/en/stable/manual_rest.html (--retry-lock)
restic_run() {
    restic --retry-lock "$LOCK_WAIT" "$@"
}

# Creates the repository on the very first run. restic exits 10 when it does not exist; any other
# failure (bad password, unreachable server) must stay a failure, so only 10 triggers `init`.
# https://restic.readthedocs.io/en/stable/075_scripting.html#exit-codes
ensure_repository() {
    local code=0
    restic cat config >/dev/null 2>&1 || code=$?
    if [ "$code" -eq 10 ]; then
        log "repository does not exist yet, creating it"
        restic init
    elif [ "$code" -ne 0 ]; then
        log "cannot open the repository (restic exit $code)"
        restic cat config >/dev/null
    fi
}

# Tells the off-host Gatus whether the job worked. Empty URL = off, no warning.
# The URL is the external endpoint WITH `?success=true` (same shape as ALERT_HEARTBEAT_URL);
# failure swaps it for `success=false` and adds the reason.
# https://github.com/TwiN/gatus#external-endpoints
heartbeat() {
    local outcome="$1" reason="${2:-}"
    local url="${BACKUP_HEARTBEAT_URL:-}"
    [ -n "$url" ] || return 0
    local args=(--silent --show-error --fail --max-time 20 --retry 3 --request POST)
    if [ -n "${BACKUP_HEARTBEAT_TOKEN:-}" ]; then
        args+=(--header "Authorization: Bearer ${BACKUP_HEARTBEAT_TOKEN}")
    fi
    if [ "$outcome" = fail ]; then
        url="${url/success=true/success=false}"
        args+=(--get --data-urlencode "error=${reason}")
    fi
    # A heartbeat that cannot be delivered is logged, never fatal: the silence IS the alarm.
    curl "${args[@]}" "$url" >/dev/null || log "heartbeat not delivered"
}

# Runs a job body; on any failure pings the heartbeat red with its name and exit code, on
# success green. `$1` names the job. The body runs as a background job and is waited for: bash
# switches `set -e` OFF for a function called inside `if`/`||`, which would let a failed `restic`
# step slide into the next one. In a background subshell `set -e` stays on.
run_job() {
    local name="$1" code=0 started
    shift
    started=$(date +%s)
    log "$name: start"
    "$@" &
    wait $! || code=$?
    if [ "$code" -eq 0 ]; then
        log "$name: done in $(($(date +%s) - started))s"
        heartbeat ok
    else
        log "$name: FAILED (exit $code) after $(($(date +%s) - started))s"
        heartbeat fail "$name failed (exit $code)"
    fi
    return "$code"
}

# Writes the mongodump/mongorestore config file holding the password, 0600, in a private temp
# dir. The tools read `password:` from it, so it never appears in `ps` or `/proc/*/cmdline`.
# https://www.mongodb.com/docs/database-tools/mongodump/#std-option-mongodump.--config
write_mongo_config() {
    local dir="$1"
    (
        umask 077
        printf 'password: "%s"\n' "$(tr -d '\n' <"$MONGO_PASSWORD_FILE")" >"$dir/mongo.yaml"
    )
}

# Reads a mongodump/mongorestore log and prints `namespace<TAB>documents`, one per collection.
# Lines look like `done dumping api.users (12 documents)` and
# `finished restoring api.users (12 documents, 0 failures)`.
count_lines() {
    sed -n -E 's/.*(done dumping|finished restoring) ([^ ]+) \(([0-9]+) documents?.*/\2\t\3/p' | sort
}
