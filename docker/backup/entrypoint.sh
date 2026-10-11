#!/usr/bin/env bash
# The `backup` service's start: turns the knobs into a crontab, then becomes supercronic.
# An empty BACKUP_REPOSITORY writes an empty crontab: the container idles, healthy, and no boot
# warning is printed (same as an empty ALERT_HEARTBEAT_URL).
# Design: docs/tools/backups.md#the-knobs
set -euo pipefail

CRONTAB="${BACKUP_CRONTAB:-/tmp/crontab}"

if [ "${BACKUP_SERVER_MODE:-false}" = true ]; then
    # The second machine's kit (docker-compose.backup-server.yml): prune and check, nothing else.
    printf '%s backup-server-maintenance\n' "${BACKUP_SERVER_SCHEDULE:-0 4 * * 0}" >"$CRONTAB"
elif [ -z "${BACKUP_REPOSITORY:-}" ]; then
    printf '# dormant: BACKUP_REPOSITORY is empty\n' >"$CRONTAB"
else
    {
        printf '%s backup-job\n' "${BACKUP_SCHEDULE:-0 * * * *}"
        printf '%s backup-maintenance\n' "${BACKUP_CHECK_SCHEDULE:-30 3 * * 0}"
    } >"$CRONTAB"
fi

# `-test` parses the crontab and exits: a bad cron expression stops the container here, loudly,
# instead of silently never running.
# `-prometheus-listen-address` serves /health (the container's healthcheck) on loopback only.
# `-passthrough-logs`: each job's output goes straight to the container log.
# https://github.com/aptible/supercronic
supercronic -test "$CRONTAB"
exec supercronic -passthrough-logs -prometheus-listen-address 127.0.0.1:9746 "$CRONTAB"
