#!/bin/sh
# Proves the alert routing and the inhibit rules: renders the template for each knob combination, validates it with
# `amtool check-config`, and checks which receiver each alert lands on with
# `amtool config routes test`; then runs a real daemon to see what it inhibits. Runs inside the Alertmanager image (it carries amtool and busybox):
#
#   docker run --rm --entrypoint sh -v "$PWD/docker/observability:/obs:ro" \
#     prom/alertmanager:v0.34.1 /obs/alertmanager-routes-test.sh
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
expect email-and-webhook alertname=ApiDown severity=critical
expect email alertname=HighErrorRate severity=warning

echo "email only"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test NODE_SMTP_HOST=smtp.example.test
expect null alertname=Watchdog
expect null alertname=AlertmanagerNotificationsFailing integration=email
expect email alertname=AlertmanagerNotificationsFailing integration=webhook
expect email alertname=ApiDown severity=critical
expect email alertname=HighErrorRate severity=warning

echo "webhook only"
render ALERT_WEBHOOK_URL=https://ntfy.example.test/alerts
expect webhook alertname=AlertmanagerNotificationsFailing integration=email
expect null alertname=AlertmanagerNotificationsFailing integration=webhook
expect webhook alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning

echo "every knob empty"
render
expect null alertname=Watchdog
expect null alertname=AlertmanagerNotificationsFailing integration=email
expect null alertname=AlertmanagerNotificationsFailing integration=webhook
expect null alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning

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
