#!/bin/sh
# Renders alertmanager.config.template.yaml from the environment, then (when asked) starts
# Alertmanager on the result. POSIX sh: the image is busybox, with no envsubst and no bash.
#
# Usage:   alertmanager-render.sh <template> <out-config> <secrets-dir> [exec alertmanager args...]
# Reads:   ALERT_EMAIL_TO, ALERT_EMAIL_FROM, ALERT_WEBHOOK_URL, ALERT_HEARTBEAT_URL,
#          ALERT_HEARTBEAT_TOKEN, and the app's NODE_SMTP_HOST / _PORT / _USER / _PASS.
#          Each of NODE_SMTP_PASS, ALERT_WEBHOOK_URL and ALERT_HEARTBEAT_TOKEN also has a `_FILE`
#          form naming a file with the value, which wins over the plain variable (an empty file is
#          unset; a named file that is missing or unreadable stops the render): production hands them over as files, dev as variables.
#          ALERT_SMTP_REQUIRE_TLS (default true) is the one extra: a plain-SMTP sink such as mailpit
#          needs false.
# Secrets: URLs, tokens and the SMTP password go to 0600 files in <secrets-dir>, never into the
#          config, so they stay out of `/api/v2/status` and the container's command line.
# Why:     docs/operate/prometheus.md#alert-routing

set -eu

template=$1
out=$2
secrets=$3
shift 3

# Escapes a value for a single-quoted YAML scalar inside a sed replacement:
# `\`, `/` and `&` are sed's, `'` is YAML's.
escape() {
    printf '%s' "$1" | sed -e 's/[\\/&]/\\&/g' -e "s/'/''/g"
}

# Writes a secret value to its own file, readable by this user only.
write_secret() {
    (umask 077 && printf '%s' "$2" > "$secrets/$1")
}

# Resolves a secret into `$secret`: the file `$2` names when it is set and holds anything, else the
# plain variable `$1`. Same rule as `secret-files.ts`: ONE trailing newline (an editor's, or
# `echo`'s) is dropped, an empty file is unset, and a file that is named but missing or unreadable
# stops the render. Falling back to the variable then would start Alertmanager with no credential
# and an alert mail would go out unauthenticated. A global rather than `$(secret_value ...)`,
# because a command substitution strips EVERY trailing newline off what it captures.
read_secret() {
    secret=$1
    [ -n "$2" ] || return 0
    if [ ! -f "$2" ] || [ ! -r "$2" ]; then
        echo "alertmanager-render: cannot read the secret file $2" >&2
        exit 1
    fi
    # The trailing `x` keeps `$(...)` from stripping newlines; it is removed again straight away.
    content=$(cat "$2"; printf x)
    content=${content%x}
    lf=$(printf '\nx')
    lf=${lf%x}
    cr=$(printf '\rx')
    cr=${cr%x}
    case $content in
        *"$cr$lf") content=${content%"$cr$lf"} ;;
        *"$lf") content=${content%"$lf"} ;;
    esac
    if [ -n "$content" ]; then secret=$content; fi
}

mkdir -p "$secrets"
chmod 700 "$secrets"

to=${ALERT_EMAIL_TO:-}
smtp_host=${NODE_SMTP_HOST:-}
smtp_user=${NODE_SMTP_USER:-}
read_secret "${NODE_SMTP_PASS:-}" "${NODE_SMTP_PASS_FILE:-}"
smtp_pass=$secret
from=${ALERT_EMAIL_FROM:-$smtp_user}
read_secret "${ALERT_WEBHOOK_URL:-}" "${ALERT_WEBHOOK_URL_FILE:-}"
webhook=$secret
heartbeat=${ALERT_HEARTBEAT_URL:-}
read_secret "${ALERT_HEARTBEAT_TOKEN:-}" "${ALERT_HEARTBEAT_TOKEN_FILE:-}"
token=$secret

# Which knob groups are on. A group needs everything it cannot work without.
email=0
[ -n "$to" ] && [ -n "$from" ] && [ -n "$smtp_host" ] && email=1
hook=0
[ -n "$webhook" ] && hook=1
beat=0
[ -n "$heartbeat" ] && beat=1

# The receiver each route points at; `null` when its knobs are empty.
default=null
[ "$email" = 1 ] && default=email
failing=null
[ "$hook" = 1 ] && failing=webhook
watchdog=null
[ "$beat" = 1 ] && watchdog=heartbeat
critical=null
if [ "$email" = 1 ] && [ "$hook" = 1 ]; then
    critical=email-and-webhook
elif [ "$email" = 1 ]; then
    critical=email
elif [ "$hook" = 1 ]; then
    critical=webhook
fi

write_secret smtp-password "$smtp_pass"
write_secret webhook-url "$webhook"
write_secret heartbeat-url "$heartbeat"
write_secret heartbeat-token "$token"

# Group markers to delete, as sed range expressions.
# Starts with a no-op so the list is never empty (a bare `sed` is a usage error).
drop="-e 's/^//'"
[ "$email" = 0 ] && drop="$drop -e '/# BEGIN email\$/,/# END email\$/d'"
[ -z "$smtp_pass" ] && drop="$drop -e '/# BEGIN smtp-auth\$/,/# END smtp-auth\$/d'"
[ "$hook" = 0 ] && drop="$drop -e '/# BEGIN webhook\$/,/# END webhook\$/d'"
[ "$beat" = 0 ] && drop="$drop -e '/# BEGIN heartbeat\$/,/# END heartbeat\$/d'"
[ -z "$token" ] && drop="$drop -e '/# BEGIN heartbeat-auth\$/,/# END heartbeat-auth\$/d'"

# `eval` only expands the fixed -e list built just above, never a knob value.
eval "sed $drop" < "$template" |
    sed \
        -e '/# \(BEGIN\|END\) /d' \
        -e "s/@RECEIVER_DEFAULT@/$default/g" \
        -e "s/@RECEIVER_WATCHDOG@/$watchdog/g" \
        -e "s/@RECEIVER_NOTIFY_FAILING@/$failing/g" \
        -e "s/@RECEIVER_CRITICAL@/$critical/g" \
        -e "s/@ALERT_EMAIL_TO@/$(escape "$to")/g" \
        -e "s/@ALERT_EMAIL_FROM@/$(escape "$from")/g" \
        -e "s/@ALERT_SMTP_HOST@/$(escape "$smtp_host")/g" \
        -e "s/@ALERT_SMTP_PORT@/$(escape "${NODE_SMTP_PORT:-587}")/g" \
        -e "s/@ALERT_SMTP_USER@/$(escape "$smtp_user")/g" \
        -e "s/require_tls: ALERT_SMTP_REQUIRE_TLS/require_tls: $(escape "${ALERT_SMTP_REQUIRE_TLS:-true}")/g" \
        -e "s/@SECRETS_DIR@/$(escape "$secrets")/g" \
        > "$out"

# With arguments, hand the process over to Alertmanager (the container's entrypoint use).
if [ "$#" -gt 0 ]; then
    exec "$@"
fi
