#!/usr/bin/env bash
# Shared by the backup scripts: the knobs with their defaults, restic's environment, the heartbeat,
# and the parser for the per-collection counts. Sourced, never run. Design: docs/operate/backups.md
#
# Knobs (docs/operate/backups.md#the-knobs):
#   BACKUP_REPOSITORY      any restic repository. Empty = dormant, nothing runs.
#   BACKUP_DATABASE        true | false. false when the database is not in this stack.
#   BACKUP_PRUNE           true | false. false when the repository is append-only (no `forget`).
#   BACKUP_KEEP_HOURLY / _DAILY / _WEEKLY / _MONTHLY   snapshots to keep.
#   BACKUP_HEARTBEAT_URL / _TOKEN                      off-host freshness check (Gatus external endpoint).
#                          BACKUP_HEARTBEAT_TOKEN_FILE names a file with the token and wins over it (an
#                          empty file is unset; a missing or unreadable one stops the job).
#   BACKUP_HOST            the restic `--host` label; one stack = one host.
#   BACKUP_HELPDESK        auto | true | false. Zammad's Postgres and attachments: `auto` backs them up when
#                          `zammad-postgres` answers by name (the helpdesk profile is on), `true` insists, `false` skips.
#   BACKUP_HELPDESK_MAX_DAYS  no Zammad dump is kept longer than this (the erasure ledger's retention).
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

# Zammad's own Postgres (the `helpdesk` compose profile): dumped with the role Zammad connects as,
# the password coming from a secret file, never the environment. Names fixed by compose.production.yaml,
# so they are constants; only the two knobs below are settings.
HELPDESK_MODE="${BACKUP_HELPDESK:-auto}"
HELPDESK_HOST=zammad-postgres
HELPDESK_PORT=5432
HELPDESK_USER=zammad
HELPDESK_DB=zammad_production
HELPDESK_PASSWORD_FILE=/run/secrets/zammad_postgres_password
HELPDESK_MAX_DAYS="${BACKUP_HELPDESK_MAX_DAYS:-220}"
# Where Zammad's attachments are mounted, read-only, when it keeps them on disk.
ZAMMAD_STORAGE_DIR="${BACKUP_ZAMMAD_STORAGE_DIR:-/data/zammad-storage}"

# Prints one timestamped line. Goes to the container log, which Alloy ships.
log() {
    printf '%s [backup] %s\n' "$(date -u +%FT%TZ)" "$*"
}

# Reads the secret file `$2` names, for the variable `$1`, into `$SECRET_FROM_FILE`.
# Same rule as `secret-files.ts`:
#   - ONE trailing newline is dropped (what an editor or `echo` leaves). A global, not `$(...)`,
#     which would strip every trailing newline;
#   - an empty file gives an empty result, so the caller's plain variable stands;
#   - a file that is missing or unreadable is a failure, never a silent fallback: the job would
#     otherwise run with no credential.
secret_from_file() {
    local variable="$1" path="$2" content
    if [ ! -f "$path" ] || [ ! -r "$path" ]; then
        log "$variable: cannot read the secret file $path"
        return 1
    fi
    # The trailing `x` keeps `$(...)` from stripping newlines; it is removed again straight away.
    content="$(cat "$path"; printf x)"
    content="${content%x}"
    case "$content" in
        *$'\r\n') content="${content%$'\r\n'}" ;;
        *$'\n') content="${content%$'\n'}" ;;
    esac
    SECRET_FROM_FILE="$content"
}

# The heartbeat's bearer token: the plain variable, or the file named by BACKUP_HEARTBEAT_TOKEN_FILE
# when it holds anything. Resolved here, once, so an unreadable file stops the job at its start
# instead of inside `heartbeat`, whose failures are deliberately never fatal.
HEARTBEAT_TOKEN="${BACKUP_HEARTBEAT_TOKEN:-}"
if [ -n "${BACKUP_HEARTBEAT_TOKEN_FILE:-}" ]; then
    secret_from_file BACKUP_HEARTBEAT_TOKEN_FILE "$BACKUP_HEARTBEAT_TOKEN_FILE" || exit 1
    if [ -n "$SECRET_FROM_FILE" ]; then HEARTBEAT_TOKEN="$SECRET_FROM_FILE"; fi
fi

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
    local token="$HEARTBEAT_TOKEN"
    local args=(--silent --show-error --fail --max-time 20 --retry 3 --request POST)
    if [ -n "$token" ]; then
        args+=(--header "Authorization: Bearer ${token}")
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

# Whether this run backs Zammad up: `true` always, `false` never, `auto` when its Postgres resolves.
helpdesk_wanted() {
    case "$HELPDESK_MODE" in
        true) return 0 ;;
        false) return 1 ;;
        auto) getent hosts "$HELPDESK_HOST" >/dev/null 2>&1 ;;
        *) log "BACKUP_HELPDESK must be auto, true or false, not '$HELPDESK_MODE'"; exit 1 ;;
    esac
}

# Forgets every Zammad dump older than BACKUP_HELPDESK_MAX_DAYS (the erasure ledger's retention), by absolute
# age. `restic forget --keep-within` would not do: it counts from the NEWEST snapshot of the group, so
# once the dumps stop (the profile was turned off) the last one would be kept for ever. `$1` limits it to
# one host label, or is empty for every host (the second machine's repositories hold one client each);
# the rest are extra `forget` flags (`--prune`).
# https://restic.readthedocs.io/en/stable/045_working_with_repos.html#listing-all-snapshots
forget_helpdesk_expired() {
    local host="$1" expired ids=() host_args=()
    shift
    if [ -n "$host" ]; then host_args=(--host "$host"); fi
    # `.time` is RFC 3339; the first 19 characters are the local date and time, which is exact enough
    # for an age counted in days.
    expired="$(restic_run snapshots "${host_args[@]}" --tag helpdesk-db --json |
        jq -r --argjson days "$HELPDESK_MAX_DAYS" \
            '.[] | select((.time[0:19] + "Z" | fromdateiso8601) < (now - $days * 86400)) | .id')"
    [ -n "$expired" ] || return 0
    mapfile -t ids <<<"$expired"
    log "forgetting ${#ids[@]} Zammad dump(s) older than ${HELPDESK_MAX_DAYS} days"
    restic_run forget "$@" "${ids[@]}"
}

# Writes the libpq password file for Zammad's Postgres, 0600, in a private temp dir, and exports
# PGPASSFILE. libpq reads the password from it, so it never appears in `ps` or the environment.
# `\` and `:` are escaped as the format requires.
# https://www.postgresql.org/docs/17/libpq-pgpass.html
write_pgpass() {
    local dir="$1" password
    secret_from_file HELPDESK_PASSWORD_FILE "$HELPDESK_PASSWORD_FILE" || return 1
    password="${SECRET_FROM_FILE//\\/\\\\}"
    password="${password//:/\\:}"
    (
        umask 077
        printf '%s:%s:%s:%s:%s\n' "$HELPDESK_HOST" "$HELPDESK_PORT" "$HELPDESK_DB" "$HELPDESK_USER" "$password" >"$dir/pgpass"
    )
    export PGPASSFILE="$dir/pgpass"
}

# Prints `tickets<TAB>N` and `users<TAB>N`: the two numbers the restore drill compares. `-A -t` is
# unaligned, tuples-only output; `-F` sets the field separator.
# https://www.postgresql.org/docs/17/app-psql.html
helpdesk_counts() {
    psql --host "$1" --port "$2" --username "$3" --dbname "$4" --no-password -A -t -F $'\t' \
        -c "SELECT 'tickets', count(*) FROM tickets UNION ALL SELECT 'users', count(*) FROM users"
}
