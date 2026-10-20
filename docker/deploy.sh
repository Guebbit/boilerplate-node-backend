#!/usr/bin/env bash
# Deploys one client's production stack, checks it came up healthy, and undoes the deploy when it did not.
#
# Usage:
#   docker/deploy.sh <client> [image]    deploy; no image = build `app` here and tag it with the git sha
#   docker/deploy.sh <client> --rollback run the previous good image again (no `setup`)
#
# Environment:
#   CONTAINER_ENGINE      podman (default) or docker; the same switch `npm run compose` uses
#   DEPLOY_TIMEOUT        seconds to wait for a healthy stack (default 240)
#   DEPLOY_KEEP           local `boilerplate-api:<sha>` images kept on the no-registry path (default 5)
#   DEPLOY_COMPOSE_FILE   the compose file (default docker-compose.production.yml)
#
# A deploy is "good" only when `setup` exited 0 and `app` and `cron` are running and healthy and
# `/readyz` answers from inside `app`. Every good state is appended to `clients/<client>/deploys.log`
# as `<UTC time> <deploy|auto-rollback|rollback> <image>`; that file is the whole record of what to
# go back to. Exit codes: 0 good, 1 the new image failed and the previous one is running again,
# 2 nothing healthy is running (no previous image, or the rollback failed too).
#
# Why we poll instead of `up --wait`: podman-compose 1.6 accepts `--wait` but exits 0 for a
# container that crashed or went unhealthy (verified), so health is read from `inspect` here.
# Design and runbook: docs/tools/deploy-and-rollback.md
set -euo pipefail

cd "$(dirname "$0")/.."

ENGINE="${CONTAINER_ENGINE:-podman}"
COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-docker-compose.production.yml}"
TIMEOUT="${DEPLOY_TIMEOUT:-240}"
KEEP="${DEPLOY_KEEP:-5}"
IMAGE_REPO="boilerplate-api"

# Prints the usage and fails.
usage() {
    echo "usage: docker/deploy.sh <client> [image | --rollback]" >&2
    exit 64
}

client="${1:-}"
[[ "$client" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || usage
shift

mode=deploy
requested_image=""
case "${1:-}" in
    "") ;;
    --rollback) mode=rollback ;;
    -*) usage ;;
    *) requested_image="$1" ;;
esac

[ -f "clients/$client/.env" ] || { echo "deploy: clients/$client/.env does not exist" >&2; exit 64; }

log_file="clients/$client/deploys.log"
export COMPOSE_PROJECT_NAME="$client"

# Compose against this client's env file and the production file, with `APP_IMAGE` as currently set.
compose() {
    $ENGINE compose --env-file "clients/$client/.env" -f "$COMPOSE_FILE" "$@"
}

# The id of a service's container (empty when there is none). Both engines label by project and service.
container_of() {
    $ENGINE ps -aq \
        --filter "label=com.docker.compose.project=$client" \
        --filter "label=com.docker.compose.service=$1" | head -n 1
}

# One line per container: `<status> <exit code> <restart count> <health>`; health is `none` without a check.
state_of() {
    local id
    id="$(container_of "$1")"
    if [ -z "$id" ]; then echo "missing 0 0 none"; return; fi
    $ENGINE inspect --format '{{.State.Status}} {{.State.ExitCode}} {{.RestartCount}} {{if .State.Health}}{{if .State.Health.Status}}{{.State.Health.Status}}{{else}}none{{end}}{{else}}none{{end}}' "$id"
}

# `/readyz` from inside `app`, the way the compose healthcheck probes `/livez`: the image has no curl.
probe_ready() {
    compose exec -T app node -e "fetch('http://127.0.0.1:'+(process.env.NODE_PORT||3000)+'/readyz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1
}

# Waits until the stack is good. $1 = `full` also requires `setup` to have exited 0.
# Returns 1 as soon as anything is clearly broken, or when the timeout runs out.
wait_healthy() {
    local scope="$1" deadline=$((SECONDS + TIMEOUT)) service status code restarts health pending
    while [ "$SECONDS" -lt "$deadline" ]; do
        pending=0
        if [ "$scope" = full ]; then
            read -r status code restarts health <<<"$(state_of setup)"
            case "$status" in
                exited | stopped) [ "$code" = 0 ] || { echo "deploy: setup exited with code $code" >&2; return 1; } ;;
                *) pending=1 ;;
            esac
        fi
        for service in app cron; do
            read -r status code restarts health <<<"$(state_of "$service")"
            # A restart in the first minutes is a crash loop, whatever the container says next.
            if [ "$restarts" -gt 0 ]; then echo "deploy: $service restarted $restarts time(s)" >&2; return 1; fi
            case "$status" in
                exited | stopped | dead | removing) echo "deploy: $service is $status (exit $code)" >&2; return 1 ;;
                running) ;;
                *) pending=1 ;;
            esac
            case "$health" in
                unhealthy) echo "deploy: $service is unhealthy" >&2; return 1 ;;
                starting) pending=1 ;;
                *) ;;
            esac
        done
        if [ "$pending" = 0 ] && probe_ready; then return 0; fi
        sleep 3
    done
    echo "deploy: not healthy after ${TIMEOUT}s" >&2
    return 1
}

# Appends `<UTC time> <event> <image>` to the client's deploy log.
record() {
    printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$APP_IMAGE" >>"$log_file"
}

# The image the last good entry names, empty when nothing has been deployed.
current_good() {
    [ -s "$log_file" ] || return 0
    tail -n 1 "$log_file" | awk '{print $3}'
}

# The newest good image that differs from the current one, empty when there is none.
previous_good() {
    local current
    current="$(current_good)"
    [ -s "$log_file" ] || return 0
    awk -v current="$current" '$3 != current { previous = $3 } END { print previous }' "$log_file"
}

# Runs `image` again for `app` and `cron` only: no `setup`, so a rollback never touches the data.
run_previous() {
    APP_IMAGE="$1"
    export APP_IMAGE
    compose up -d --no-build --no-deps app cron
}

# Prints what the failed services said, for whoever reads the CI or terminal log.
show_logs() {
    compose logs --tail 40 setup app cron 2>&1 || true
}

# No-registry path only: removes local `boilerplate-api:<tag>` images older than the last $KEEP good ones.
# Podman reports a local build as `localhost/boilerplate-api:<tag>`; the log names it without that prefix.
prune_images() {
    local keep image short
    keep="$(awk '{print $3}' "$log_file" | awk '!seen[$0]++' | tail -n "$KEEP")"
    $ENGINE images --format '{{.Repository}}:{{.Tag}}' --filter "reference=$IMAGE_REPO" | while read -r image; do
        short="${image#localhost/}"
        [ "$short" = "$IMAGE_REPO:latest" ] && continue
        grep -qxF "$short" <<<"$keep" || $ENGINE rmi "$image" >/dev/null 2>&1 || true
    done
}

if [ "$mode" = rollback ]; then
    previous="$(previous_good)"
    [ -n "$previous" ] || { echo "deploy: no earlier good image in $log_file" >&2; exit 2; }
    echo "deploy: rolling back to $previous"
    run_previous "$previous"
    if wait_healthy partial; then record rollback; echo "deploy: rolled back to $APP_IMAGE"; exit 0; fi
    show_logs
    echo "deploy: the rollback did not come up healthy" >&2
    exit 2
fi

previous="$(current_good)"

if [ -n "$requested_image" ]; then
    APP_IMAGE="$requested_image"
    export APP_IMAGE
    # A digest never changes, so an image already on the host is the image: pull only when it is missing.
    $ENGINE image inspect "$APP_IMAGE" >/dev/null 2>&1 || $ENGINE pull "$APP_IMAGE"
else
    sha="$(git rev-parse --short HEAD)"
    [ -z "$(git status --porcelain)" ] || sha="$sha-dirty"
    APP_IMAGE="$IMAGE_REPO:$sha"
    export APP_IMAGE
    compose build app
fi

echo "deploy: starting $APP_IMAGE"
# `--no-build`: the image is already what we mean to run; compose must never build over it.
compose up -d --no-build

if wait_healthy full; then
    record deploy
    [ -n "$requested_image" ] || prune_images
    echo "deploy: $APP_IMAGE is healthy"
    exit 0
fi

show_logs
failed="$APP_IMAGE"
if [ -z "$previous" ]; then
    echo "deploy: $failed failed and there is no earlier good image to go back to" >&2
    exit 2
fi

echo "deploy: $failed failed; going back to $previous" >&2
run_previous "$previous"
if wait_healthy partial; then
    record auto-rollback
    echo "deploy: $previous is running again" >&2
    exit 1
fi
show_logs
echo "deploy: the rollback to $previous did not come up healthy either" >&2
exit 2
