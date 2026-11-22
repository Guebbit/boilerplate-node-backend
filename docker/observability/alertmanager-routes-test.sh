#!/bin/sh
# Proves the alert routing and the inhibit rules: renders the template for each knob combination, validates it with
# `amtool check-config`, and checks which receiver each alert lands on with
# `amtool config routes test`; then runs a real daemon to see what it inhibits. Runs inside the Alertmanager image (it carries amtool and busybox):
#
#   docker run --rm --entrypoint sh -v "$PWD/docker/observability:/obs:ro" \
#     prom/alertmanager:v0.34.2 /obs/alertmanager-routes-test.sh
#
# https://github.com/prometheus/alertmanager#amtool

set -eu

here=$(dirname "$0")
work=$(mktemp -d)

# Renders with the environment given as `NAME=value` arguments, into $work/alertmanager.yml.
render() {
    env -i PATH="$PATH" "$@" \
        sh "$here/alertmanager-render.sh" \
        "$here/alertmanager.config.template.yaml" "$work/alertmanager.yml" "$work/secrets"
    amtool check-config "$work/alertmanager.yml" > /dev/null
}

# Asserts the receiver an alert with the given labels is routed to.
# Usage: expect <receiver> <label=value>...
expect() {
    receiver=$1
    shift
    amtool config routes test --config.file="$work/alertmanager.yml" \
        --verify.receivers="$receiver" "$@" > /dev/null ||
        {
            echo "FAIL: [$*] did not route to '$receiver'" >&2
            exit 1
        }
}

echo "all knobs set"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test \
    NODE_SMTP_HOST=smtp.example.test NODE_SMTP_PASS=secret \
    ALERT_WEBHOOK_URL=https://ntfy.example.test/alerts \
    ALERT_HEARTBEAT_URL=https://gatus.example.test/api/v1/endpoints/x/external ALERT_HEARTBEAT_TOKEN=token
expect heartbeat alertname=Watchdog
expect webhook alertname=AlertmanagerNotificationsFailing integration=email severity=warning
expect email alertname=AlertmanagerNotificationsFailing integration=webhook severity=warning
expect critical alertname=ApiDown severity=critical
expect email alertname=HighErrorRate severity=warning

echo "email only"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test NODE_SMTP_HOST=smtp.example.test
expect null alertname=Watchdog
expect null alertname=AlertmanagerNotificationsFailing integration=email
expect email alertname=AlertmanagerNotificationsFailing integration=webhook
expect critical alertname=ApiDown severity=critical
expect email alertname=HighErrorRate severity=warning

echo "webhook only"
render ALERT_WEBHOOK_URL=https://ntfy.example.test/alerts
expect webhook alertname=AlertmanagerNotificationsFailing integration=email
expect null alertname=AlertmanagerNotificationsFailing integration=webhook
expect critical alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning

echo "every knob empty"
render
expect null alertname=Watchdog
expect null alertname=AlertmanagerNotificationsFailing integration=email
expect null alertname=AlertmanagerNotificationsFailing integration=webhook
expect null alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning

mkdir -p "$work/in"

# Fails when the rendered config does (not) hold a line. Usage: has|lacks <fixed text>
has() {
    grep -qF -- "$1" "$work/alertmanager.yml" ||
        {
            echo "FAIL: the config should hold: $1" >&2
            exit 1
        }
}
lacks() {
    if grep -qF -- "$1" "$work/alertmanager.yml"; then
        echo "FAIL: the config should not hold: $1" >&2
        exit 1
    fi
}

echo "ntfy only: the template and the urgent priority are added to the topic URL"
render ALERT_NTFY_URL=https://ntfy.example.test/topic
expect critical alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning
has "url_file: '$work/secrets/ntfy-url'"
# Its priority is part of the URL, so the resolution must not be pushed.
has 'send_resolved: false'
lacks 'telegram_configs'
lacks 'pushover_configs'
lacks 'email_configs'
lacks 'authorization'
grep -qx 'https://ntfy.example.test/topic?template=alertmanager&priority=urgent' "$work/secrets/ntfy-url" ||
    {
        echo "FAIL: the ntfy URL did not get the template and the priority" >&2
        exit 1
    }

echo "ntfy: a URL that already has a query gets &, and a token adds the bearer header"
render ALERT_NTFY_URL='https://ntfy.example.test/topic?auth=x' ALERT_NTFY_TOKEN=tk_dummy
grep -qx 'https://ntfy.example.test/topic?auth=x&template=alertmanager&priority=urgent' "$work/secrets/ntfy-url" ||
    {
        echo "FAIL: a URL with a query was not extended with &" >&2
        exit 1
    }
has "credentials_file: '$work/secrets/ntfy-token'"
grep -qx 'tk_dummy' "$work/secrets/ntfy-token" ||
    {
        echo "FAIL: the ntfy token was not written" >&2
        exit 1
    }

echo "Telegram only"
render ALERT_TELEGRAM_BOT_TOKEN=123:dummy ALERT_TELEGRAM_CHAT_ID=-100123
expect critical alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning
has "bot_token_file: '$work/secrets/telegram-bot-token'"
has 'chat_id: -100123'
lacks 'webhook_configs'
lacks 'pushover_configs'
lacks '123:dummy'

echo "Telegram needs both the token and the chat id"
render ALERT_TELEGRAM_BOT_TOKEN=123:dummy
expect null alertname=ApiDown severity=critical
render ALERT_TELEGRAM_CHAT_ID=123
expect null alertname=ApiDown severity=critical

echo "Pushover only: urgent while firing, an ordinary message on resolution"
render ALERT_PUSHOVER_USER_KEY=userdummy ALERT_PUSHOVER_TOKEN=tokendummy
expect critical alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning
has "user_key_file: '$work/secrets/pushover-user-key'"
has "token_file: '$work/secrets/pushover-token'"
has 'priority: '"'"'{{ if eq .Status "firing" }}2{{ else }}0{{ end }}'"'"
has 'retry: 5m'
has 'expire: 1h'
lacks 'webhook_configs'
lacks 'telegram_configs'

echo "Pushover needs both the user key and the token"
render ALERT_PUSHOVER_USER_KEY=userdummy
expect null alertname=ApiDown severity=critical

echo "every channel on: one critical receiver holds them all, and warnings stay on email"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test \
    NODE_SMTP_HOST=smtp.example.test ALERT_WEBHOOK_URL=https://hook.example.test/x \
    ALERT_NTFY_URL=https://ntfy.example.test/topic ALERT_NTFY_TOKEN=tk_dummy \
    ALERT_TELEGRAM_BOT_TOKEN=123:dummy ALERT_TELEGRAM_CHAT_ID=123 \
    ALERT_PUSHOVER_USER_KEY=userdummy ALERT_PUSHOVER_TOKEN=tokendummy
expect critical alertname=ApiDown severity=critical
expect email alertname=HighErrorRate severity=warning
expect webhook alertname=AlertmanagerNotificationsFailing integration=email severity=warning
has "url_file: '$work/secrets/webhook-url'"
has "url_file: '$work/secrets/ntfy-url'"
has 'telegram_configs'
has 'pushover_configs'
has 'email_configs'
# Two items under ONE webhook_configs key: a second key would be a duplicate and the daemon refuses it.
[ "$(grep -c 'webhook_configs:' "$work/alertmanager.yml")" -eq 2 ] ||
    {
        echo "FAIL: expected webhook_configs once in critical and once in webhook" >&2
        exit 1
    }

echo "the push secrets from files, and never in the config"
printf '%s\n' 'https://ntfy.example.test/from-file' > "$work/in/ntfy"
printf '%s\n' '999:from-file' > "$work/in/tg"
render ALERT_NTFY_URL_FILE="$work/in/ntfy" ALERT_TELEGRAM_BOT_TOKEN_FILE="$work/in/tg" \
    ALERT_TELEGRAM_CHAT_ID=123
grep -qx 'https://ntfy.example.test/from-file?template=alertmanager&priority=urgent' "$work/secrets/ntfy-url" ||
    {
        echo "FAIL: the ntfy URL file was not read" >&2
        exit 1
    }
grep -qx '999:from-file' "$work/secrets/telegram-bot-token" ||
    {
        echo "FAIL: the Telegram token file was not read" >&2
        exit 1
    }
lacks 'from-file'
[ "$(stat -c %a "$work/secrets/telegram-bot-token")" = 600 ] ||
    {
        echo "FAIL: a push secret file must be readable by its owner only" >&2
        exit 1
    }

echo "the SMTP password from a file"
printf '%s\n' 'from-a-file' > "$work/in/pass"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test \
    NODE_SMTP_HOST=smtp.example.test NODE_SMTP_PASS_FILE="$work/in/pass"
grep -qx 'from-a-file' "$work/secrets/smtp-password" ||
    {
        echo "FAIL: the SMTP password file was not read (or kept its newline)" >&2
        exit 1
    }
grep -q 'auth_password_file' "$work/alertmanager.yml" ||
    {
        echo "FAIL: a non-empty password file must switch SMTP auth on" >&2
        exit 1
    }

echo "the webhook URL and heartbeat token from files"
printf '%s\n' 'https://ntfy.example.test/from-file' > "$work/in/hook"
printf '%s\n' 'token-from-file' > "$work/in/beat"
render ALERT_WEBHOOK_URL_FILE="$work/in/hook" ALERT_HEARTBEAT_TOKEN_FILE="$work/in/beat" \
    ALERT_HEARTBEAT_URL=https://gatus.example.test/api/v1/endpoints/x/external
expect critical alertname=ApiDown severity=critical
expect heartbeat alertname=Watchdog
grep -qx 'https://ntfy.example.test/from-file' "$work/secrets/webhook-url" ||
    {
        echo "FAIL: the webhook URL file was not read" >&2
        exit 1
    }
grep -qx 'token-from-file' "$work/secrets/heartbeat-token" ||
    {
        echo "FAIL: the heartbeat token file was not read" >&2
        exit 1
    }

echo "an empty webhook file leaves the webhook route off"
: > "$work/in/hook"
render ALERT_WEBHOOK_URL_FILE="$work/in/hook"
expect null alertname=ApiDown severity=critical

echo "an empty password file is unset"
: > "$work/in/pass"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test \
    NODE_SMTP_HOST=smtp.example.test NODE_SMTP_PASS_FILE="$work/in/pass"
if grep -q 'auth_password_file' "$work/alertmanager.yml"; then
    echo "FAIL: an empty password file must leave SMTP auth off" >&2
    exit 1
fi

echo "a named secret file that is missing stops the render, and the plain variable does not stand in"
if env -i PATH="$PATH" ALERT_WEBHOOK_URL=https://ntfy.example.test/plain \
    ALERT_WEBHOOK_URL_FILE="$work/in/does-not-exist" \
    sh "$here/alertmanager-render.sh" "$here/alertmanager.config.template.yaml" \
    "$work/alertmanager.yml" "$work/secrets" 2> "$work/err"; then
    echo "FAIL: a missing secret file must fail the render" >&2
    exit 1
fi
grep -q "does-not-exist" "$work/err" ||
    {
        echo "FAIL: the failure must name the file" >&2
        exit 1
    }

echo "only ONE trailing newline is dropped from a secret file"
printf '%s\n\n' 'two-newlines' > "$work/in/pass"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test \
    NODE_SMTP_HOST=smtp.example.test NODE_SMTP_PASS_FILE="$work/in/pass"
[ "$(wc -l < "$work/secrets/smtp-password")" -eq 1 ] ||
    {
        echo "FAIL: the second trailing newline was stripped" >&2
        exit 1
    }

echo "values with / & and ' survive the render"
render ALERT_EMAIL_TO="a/b&c@example.test" ALERT_EMAIL_FROM="O'Brien <o@example.test>" NODE_SMTP_HOST=smtp.example.test
grep -q "to: 'a/b&c@example.test'" "$work/alertmanager.yml" ||
    {
        echo "FAIL: the address was mangled" >&2
        exit 1
    }

# Runs a real Alertmanager on the rendered config and asks which alerts it holds back. `amtool`
# has no static test for inhibit rules, and the daemon is in the same image.
echo "inhibit rules"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test NODE_SMTP_HOST=smtp.example.test
alertmanager --config.file="$work/alertmanager.yml" --storage.path="$work/data" \
    --web.listen-address=127.0.0.1:19093 --cluster.listen-address= > "$work/alertmanager.log" 2>&1 &
daemon=$!
trap 'kill "$daemon" 2> /dev/null || true' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do
    wget -qO- http://127.0.0.1:19093/-/ready > /dev/null 2>&1 && break
    sleep 1
done
am="amtool --alertmanager.url=http://127.0.0.1:19093"

# A dead database, a dead queue and a down API, each with the alerts it should hide and the ones
# it must not.
$am alert add alertname=DependencyUnavailable dependency=database severity=critical
$am alert add alertname=DependencyUnavailable dependency=queue severity=warning
$am alert add alertname=ApiDown severity=critical
for name in HighErrorRate HighP95Latency UnhandledRejections QueueJobsParked WebhookRetriesStalled \
    ApiRestarting AuditSinkFailing; do
    $am alert add "alertname=$name" severity=warning
done
sleep 3

inhibited=$($am alert query --inhibited)
active=$($am alert query)
for name in HighErrorRate HighP95Latency UnhandledRejections QueueJobsParked WebhookRetriesStalled \
    ApiRestarting; do
    echo "$inhibited" | grep -q "^$name " ||
        {
            echo "FAIL: $name should be inhibited" >&2
            exit 1
        }
done
# Never muted: the gap in the audit trail is real whatever the cause.
echo "$active" | grep -q "^AuditSinkFailing " ||
    {
        echo "FAIL: AuditSinkFailing must stay active" >&2
        exit 1
    }

echo "alertmanager routing: ok"
