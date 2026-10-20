#!/usr/bin/env bash
# End-to-end proof of docker/deploy.sh on the real production compose file, with a throwaway client:
#   1. deploy the image built here: healthy, `/livez` answers, the log records it
#   2. deploy a broken image (the same image with a CMD that exits): refused, and the first image
#      is running again ("auto-rollback" in the log, exit 1)
#   3. deploy a second good image, then `--rollback`: the first image runs again ("rollback")
# The client has generated secrets and lives under `clients/` (gitignored); the stack, its volumes,
# the drill images and the client directory are all removed at the end, whatever happened.
# Run it: `npm run deploy:drill`. Docs: docs/tools/deploy-and-rollback.md#the-drill
set -euo pipefail

cd "$(dirname "$0")/.."

ENGINE="${CONTAINER_ENGINE:-podman}"
CLIENT="deploydrill$$"
PORT="${DEPLOY_DRILL_PORT:-3996}"
DIR="clients/$CLIENT"
TMP="$(mktemp -d)"
PASS=0
export DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT:-300}"

# Prints a step heading.
step() { printf '\n=== %s\n' "$*"; }

# Fails the drill with a message.
die() { printf 'DEPLOY DRILL FAILED: %s\n' "$*" >&2; exit 1; }

# Removes the stack, its volumes, the drill images and the client directory, whatever happened.
cleanup() {
    local code=$?
    if [ -n "${DEPLOY_DRILL_KEEP:-}" ]; then echo "kept: client $CLIENT, tmp $TMP"; return; fi
    COMPOSE_PROJECT_NAME="$CLIENT" APP_IMAGE=unused \
        $ENGINE compose --env-file "$DIR/.env" -f docker-compose.production.yml down -v --remove-orphans >/dev/null 2>&1 || true
    $ENGINE ps -aq --filter "label=com.docker.compose.project=$CLIENT" | xargs -r $ENGINE rm -f >/dev/null 2>&1 || true
    for tag in "${DRILL_TAGS[@]:-}"; do [ -n "$tag" ] && $ENGINE rmi -f "$tag" >/dev/null 2>&1 || true; done
    rm -rf "$DIR" "$TMP"
    if [ "$code" -eq 0 ] && [ "$PASS" -eq 1 ]; then echo "DEPLOY DRILL PASSED"; else echo "DEPLOY DRILL DID NOT PASS (exit $code)" >&2; fi
    exit "$code"
}
DRILL_TAGS=()
trap cleanup EXIT

# Runs docker/deploy.sh and keeps its exit code in $deploy_code instead of aborting the drill.
deploy() {
    set +e
    docker/deploy.sh "$CLIENT" "$@"
    deploy_code=$?
    set -e
}

# The id of a service's container in the drill stack.
container_of() {
    $ENGINE ps -aq --filter "label=com.docker.compose.project=$CLIENT" --filter "label=com.docker.compose.service=$1" | head -n 1
}

# The image the running `app` was created from.
running_image() { $ENGINE inspect --format '{{.Config.Image}}' "$(container_of app)"; }

# Fails unless `app` runs an image whose name ends in $1 (a local build is reported as `localhost/<name>`).
assert_running() {
    local actual
    actual="$(running_image)"
    case "$actual" in *"$1") echo "app runs $actual" ;; *) die "expected app to run $1, found $actual" ;; esac
}

# Fails unless the last line of the deploy log is event $1 for an image ending in $2.
assert_log_tail() {
    local event image
    read -r _ event image <<<"$(tail -n 1 "$DIR/deploys.log")"
    [ "$event" = "$1" ] || die "expected the log to end with '$1', found '$event $image'"
    case "$image" in *"$2") ;; *) die "expected the log to end with an image ending in $2, found $image" ;; esac
}

# Fails unless the API answers `/livez` on the published loopback port.
assert_alive() { curl -fsS "http://127.0.0.1:$PORT/livez" >/dev/null || die "/livez does not answer on port $PORT"; }

# Builds a derived image: the first image plus the Dockerfile lines in $2, tagged $1.
derive() {
    printf 'FROM %s\n%s\n' "$FIRST_IMAGE" "$2" >"$TMP/Dockerfile"
    $ENGINE build -q -f "$TMP/Dockerfile" -t "$1" "$TMP" >/dev/null
    DRILL_TAGS+=("$1")
}

step "a throwaway client with generated secrets"
if curl -fsS "http://127.0.0.1:$PORT/livez" >/dev/null 2>&1; then die "port $PORT is already in use"; fi
mkdir -p -m 0700 "$DIR/secrets"
for name in mongo_root_password mongo_app_password mongo_backup_password restic_password \
    redis_password limits_password rabbitmq_password token_access token_refresh totp_encryption_key \
    pii_encryption_key webhook_secret_encryption_key pseudonym_key metrics_token; do
    openssl rand -hex 32 >"$DIR/secrets/$name"
    chmod 0644 "$DIR/secrets/$name"
done
: >"$DIR/secrets/restic_repository_env"
cat >"$DIR/.env" <<E
COMPOSE_PROFILES=bundled
NODE_PORT=$PORT
NODE_URL=https://api.example.com
NODE_FRONTEND_URL=https://shop.example.com
NODE_CORS_ORIGIN=https://shop.example.com
NODE_DEVICE_COOKIE_SECRET=$(openssl rand -hex 32)
NODE_SHOP_COUNTRY=IT
NODE_SHOP_TIMEZONE=Europe/Rome
NODE_SHOP_LEGAL_NAME=Deploy Drill S.r.l.
NODE_SHOP_STREET=Via Roma 1
NODE_SHOP_CITY=Bologna
NODE_SHOP_ZIP=40121
NODE_SHOP_EMAIL=shop@example.com
NODE_SHOP_PHONE=+39 051 555 0100
NODE_VAT_RATE_DEFAULT=0.22
NODE_VAT_RATE_REDUCED=0.10
E

step "deploy 1: build the image here and start the stack"
deploy
[ "$deploy_code" -eq 0 ] || die "the first deploy exited $deploy_code"
read -r _ _ FIRST_IMAGE <<<"$(tail -n 1 "$DIR/deploys.log")"
DRILL_TAGS+=("$FIRST_IMAGE")
assert_log_tail deploy "${FIRST_IMAGE##*:}"
assert_running "${FIRST_IMAGE##*:}"
assert_alive

step "deploy 2: an image that exits at once is refused and the first one comes back"
derive boilerplate-api:drill-broken 'CMD ["node", "-e", "process.exit(1)"]'
deploy boilerplate-api:drill-broken
[ "$deploy_code" -eq 1 ] || die "the broken deploy exited $deploy_code, expected 1"
assert_log_tail auto-rollback "${FIRST_IMAGE##*:}"
assert_running "${FIRST_IMAGE##*:}"
assert_alive

step "deploy 3: a second good image"
derive boilerplate-api:drill-second 'ENV DEPLOY_DRILL=second'
deploy boilerplate-api:drill-second
[ "$deploy_code" -eq 0 ] || die "the second deploy exited $deploy_code"
assert_log_tail deploy drill-second
assert_running drill-second
assert_alive

step "--rollback: back to the first image, without running setup"
setup_before="$(container_of setup)"
deploy --rollback
[ "$deploy_code" -eq 0 ] || die "--rollback exited $deploy_code"
assert_log_tail rollback "${FIRST_IMAGE##*:}"
assert_running "${FIRST_IMAGE##*:}"
assert_alive
[ "$(container_of setup)" = "$setup_before" ] || die "--rollback recreated setup"

PASS=1
