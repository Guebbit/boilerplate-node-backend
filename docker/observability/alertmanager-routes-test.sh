#!/bin/sh
# Proves the alert routing: renders the template for each knob combination, validates it with
# `amtool check-config`, and checks which receiver each alert lands on with
# `amtool config routes test`. Runs inside the Alertmanager image (it carries amtool and busybox):
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
expect webhook alertname=AlertmanagerNotificationsFailing severity=warning
expect email-and-webhook alertname=ApiDown severity=critical
expect email alertname=HighErrorRate severity=warning

echo "email only"
render ALERT_EMAIL_TO=ops@example.test ALERT_EMAIL_FROM=alerts@example.test NODE_SMTP_HOST=smtp.example.test
expect null alertname=Watchdog
expect null alertname=AlertmanagerNotificationsFailing
expect email alertname=ApiDown severity=critical
expect email alertname=HighErrorRate severity=warning

echo "webhook only"
render ALERT_WEBHOOK_URL=https://ntfy.example.test/alerts
expect webhook alertname=AlertmanagerNotificationsFailing
expect webhook alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning

echo "every knob empty"
render
expect null alertname=Watchdog
expect null alertname=AlertmanagerNotificationsFailing
expect null alertname=ApiDown severity=critical
expect null alertname=HighErrorRate severity=warning

echo "values with / & and ' survive the render"
render ALERT_EMAIL_TO="a/b&c@example.test" ALERT_EMAIL_FROM="O'Brien <o@example.test>" NODE_SMTP_HOST=smtp.example.test
grep -q "to: 'a/b&c@example.test'" "$work/alertmanager.yml" ||
    {
        echo "FAIL: the address was mangled" >&2
        exit 1
    }

echo "alertmanager routing: ok"
