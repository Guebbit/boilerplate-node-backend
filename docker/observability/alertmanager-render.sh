#!/bin/sh
# Renders alertmanager.config.template.yaml from the environment, then (when asked) starts
# Alertmanager on the result. POSIX sh: the image is busybox, with no envsubst and no bash.
#
# Usage:   alertmanager-render.sh <template> <out-config> <secrets-dir> [exec alertmanager args...]
# Reads:   ALERT_EMAIL_TO, ALERT_EMAIL_FROM, ALERT_WEBHOOK_URL, ALERT_HEARTBEAT_URL,
#          ALERT_HEARTBEAT_TOKEN, and the app's NODE_SMTP_HOST / _PORT / _USER / _PASS.
#          ALERT_SMTP_REQUIRE_TLS (default true) is the one extra: a plain-SMTP sink such as mailpit
#          needs false.
# Secrets: URLs, tokens and the SMTP password go to 0600 files in <secrets-dir>, never into the
#          config, so they stay out of `/api/v2/status` and the container's command line.
# Why:     docs/tools/prometheus.md#alert-routing

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

mkdir -p "$secrets"
chmod 700 "$secrets"

to=${ALERT_EMAIL_TO:-}
smtp_host=${NODE_SMTP_HOST:-}
smtp_user=${NODE_SMTP_USER:-}
smtp_pass=${NODE_SMTP_PASS:-}
from=${ALERT_EMAIL_FROM:-$smtp_user}
webhook=${ALERT_WEBHOOK_URL:-}
heartbeat=${ALERT_HEARTBEAT_URL:-}
token=${ALERT_HEARTBEAT_TOKEN:-}

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
