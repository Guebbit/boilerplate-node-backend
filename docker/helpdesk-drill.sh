#!/usr/bin/env bash
# End-to-end proof of the `helpdesk` profile in compose.production.yaml, with a throwaway client:
#   1. the compose file parses with and without the profile
#   2. Zammad boots from the pinned images, seeded by docker/zammad/autowizard.drill.json
#   3. only `zammad-nginx` publishes a port, and on loopback
#   4. behind the documented edge proxy (the `$remote_addr` snippet), a staff sign-in shows the REAL
#      client address in Zammad's session list, and a forged `X-Forwarded-For` does not change it
#   5. the edge refuses any `Authorization` header with 403 (a token skips Zammad's 2FA), and a real
#      Chromium signs in to Zammad's own screen through it with no request carrying that header
#   6. the geo lookup (`geo_ip_backend`) is off after the seed settings, the way the runbook turns it off
#   7. a second client stack, without the profile, comes up beside it: no network clash
# The client has generated secrets and lives under `clients/` (gitignored); the stack, its volumes,
# the edge proxy and the client directory are all removed at the end, whatever happened.
# Linux only: the client address is 127.0.0.5, which macOS does not route to the loopback.
# Run it: `npm run helpdesk:drill`. Docs: docs/operate/zammad.md#the-drill
set -euo pipefail

cd "$(dirname "$0")/.."

ENGINE="${CONTAINER_ENGINE:-podman}"
PROJECT="boilerplate-helpdesk-drill"
OTHER="boilerplate-helpdesk-drill-b"
PORT="${HELPDESK_DRILL_PORT:-3961}"
EDGE_PORT="${HELPDESK_DRILL_EDGE_PORT:-3962}"
EDGE="http://127.0.0.1:$EDGE_PORT"
# The address the drill's "staff member" connects from, and the one it forges.
CLIENT_ADDRESS=127.0.0.5
FORGED_ADDRESS=203.0.113.9
# The Zammad image the compose file pins: the edge proxy below borrows its nginx, so the drill needs
# no second image.
ZAMMAD_IMAGE="$(sed -n -E 's/^x-zammad-image: &zammad-image (.+)$/\1/p' compose.production.yaml)"
TMP="$(mktemp -d)"
PASS=0

# Prints a step heading.
step() { printf '\n=== %s\n' "$*"; }

# Fails the drill with a message.
die() { printf 'HELPDESK DRILL FAILED: %s\n' "$*" >&2; exit 1; }

# Removes both stacks, their volumes and networks, the edge proxy and the client directories, whatever happened.
cleanup() {
    local code=$?
    if [ -n "${HELPDESK_DRILL_KEEP:-}" ]; then echo "kept: projects $PROJECT and $OTHER, tmp $TMP"; return; fi
    $ENGINE rm -f -v "$PROJECT-edge" >/dev/null 2>&1 || true
    for project in "$PROJECT" "$OTHER"; do
        compose "$project" down -v --remove-orphans >/dev/null 2>&1 || true
        $ENGINE ps -aq --filter "label=com.docker.compose.project=$project" | xargs -r $ENGINE rm -f -v >/dev/null 2>&1 || true
        $ENGINE volume ls -q --filter "label=com.docker.compose.project=$project" | xargs -r $ENGINE volume rm -f >/dev/null 2>&1 || true
        $ENGINE network ls -q --filter "label=com.docker.compose.project=$project" | xargs -r $ENGINE network rm >/dev/null 2>&1 || true
        rm -rf "clients/$project"
    done
    rm -rf "$TMP"
    if [ "$code" -eq 0 ] && [ "$PASS" -eq 1 ]; then echo "HELPDESK DRILL PASSED"; else echo "HELPDESK DRILL DID NOT PASS (exit $code)" >&2; fi
    exit "$code"
}
trap cleanup EXIT

# Compose for client $1, with the rest of the arguments. Every container carries `crew=boilerplate`
# (CLAUDE.md § Containers), from the override file written below.
compose() {
    local project="$1"
    shift
    COMPOSE_PROJECT_NAME="$project" APP_IMAGE="${DRILL_APP_IMAGE:-$ZAMMAD_IMAGE}" ZAMMAD_PORT="$PORT" \
        ZAMMAD_AUTOWIZARD_JSON="$(base64 -w0 docker/zammad/autowizard.drill.json)" \
        $ENGINE compose --env-file "clients/$project/.env" -f compose.yaml -f compose.production.yaml \
        -f "$TMP/labels.yaml" "$@"
}

# A throwaway client directory $1 with generated secrets. The integration secrets are optional: empty is unset.
make_client() {
    mkdir -p "clients/$1"
    mkdir -m 0700 "clients/$1/secrets"
    for name in mongo_root_password mongo_app_password mongo_backup_password restic_password \
        redis_password limits_password rabbitmq_password token_access token_refresh totp_encryption_key \
        pii_encryption_key webhook_secret_encryption_key pseudonym_key metrics_token device_cookie_secret \
        smtp_password zammad_postgres_password zammad_postgres_superuser_password; do
        openssl rand -hex 32 >"clients/$1/secrets/$name"
        chmod 0644 "clients/$1/secrets/$name"
    done
    for name in restic_repository_env payment_webhook_secret oauth_google_client_secret oauth_github_client_secret \
        antibot_altcha_secret antibot_turnstile_secret posthog_personal_api_key alert_webhook_url \
        alert_heartbeat_token backup_heartbeat_token zammad_api_token; do
        : >"clients/$1/secrets/$name"
    done
    printf 'COMPOSE_PROFILES=%s\n' "$2" >"clients/$1/.env"
}

# The id of a service's container in project $1.
container_of() {
    $ENGINE ps -aq --filter "label=com.docker.compose.project=$1" --filter "label=com.docker.compose.service=$2" | head -n 1
}

# Signs in as the seeded admin through the edge, with the curl options in "$@" (the source address,
# a forged header), and prints the address Zammad recorded for this sign-in's device `$fingerprint`.
# Zammad's API wants its CSRF token, which arrives as a `csrf-token` response header on every reply.
signed_in_address() {
    local fingerprint="$1" jar hdr csrf
    shift
    jar="$TMP/jar-$fingerprint"
    hdr="$TMP/headers-$fingerprint"
    csrf_of() { sed -n -E 's/^[Cc][Ss][Rr][Ff]-[Tt]oken: *//p' "$hdr" | tr -d '\r'; }
    curl -fsS "$@" -c "$jar" -b "$jar" -o /dev/null -D "$hdr" "$EDGE/api/v1/signshow"
    csrf="$(csrf_of)"
    curl -fsS "$@" -c "$jar" -b "$jar" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' \
        -d "{\"username\":\"drill-admin@example.com\",\"password\":\"Drill-Admin-Pass-2026\",\"fingerprint\":\"$fingerprint\"}" \
        -o /dev/null -D "$hdr" "$EDGE/api/v1/signin"
    csrf="$(csrf_of)"
    # The admin "Sessions" list: each session keeps the device address Zammad derived for it.
    curl -fsS "$@" -c "$jar" -b "$jar" -H "X-CSRF-Token: $csrf" "$EDGE/api/v1/sessions" |
        FINGERPRINT="$fingerprint" node -e '
            let body = "";
            process.stdin.on("data", (chunk) => { body += chunk; });
            process.stdin.on("end", () => {
                const mine = JSON.parse(body).sessions.filter((s) => s.data.user_device_fingerprint === process.env.FINGERPRINT);
                process.stdout.write(mine.map((s) => s.data.user_device_remote_ip).join("\n"));
            });
        '
}

step "the compose file parses, with and without the helpdesk profile"
cat >"$TMP/labels.yaml" <<'E'
services:
    app: { labels: { crew: boilerplate } }
    zammad-postgres: { labels: { crew: boilerplate } }
    zammad-redis: { labels: { crew: boilerplate } }
    zammad-memcached: { labels: { crew: boilerplate } }
    zammad-init: { labels: { crew: boilerplate } }
    zammad-railsserver: { labels: { crew: boilerplate } }
    zammad-scheduler: { labels: { crew: boilerplate } }
    zammad-websocket: { labels: { crew: boilerplate } }
    zammad-nginx: { labels: { crew: boilerplate } }
E
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then die "port $PORT is already in use"; fi
if curl -fsS "$EDGE/" >/dev/null 2>&1; then die "port $EDGE_PORT is already in use"; fi
make_client "$PROJECT" helpdesk
COMPOSE_PROFILES=bundled compose "$PROJECT" config -q || die "the compose file does not parse without the profile"
COMPOSE_PROFILES=bundled,helpdesk compose "$PROJECT" config -q || die "the compose file does not parse with the profile"
echo "both parse"

step "boot Zammad from the pinned images, seeded by the autowizard file"
compose "$PROJECT" up -d zammad-init zammad-nginx zammad-scheduler zammad-websocket
# `zammad-init` migrates and exits 0; nginx answers once Rails is ready. Both can take minutes on a cold pull.
ready=""
for _ in $(seq 1 120); do
    init="$($ENGINE inspect --format '{{.State.Status}} {{.State.ExitCode}}' "$(container_of "$PROJECT" zammad-init)" 2>/dev/null || true)"
    if [ "$init" = "exited 0" ] && curl -fsS "http://127.0.0.1:$PORT/api/v1/getting_started" >/dev/null 2>&1; then ready=1; break; fi
    sleep 5
done
[ -n "$ready" ] || die "Zammad did not become ready in ten minutes (zammad-init: ${init:-unknown})"
# Running the wizard creates the admin and applies the file's settings, once.
curl -fsS "http://127.0.0.1:$PORT/api/v1/getting_started/auto_wizard" | grep -q '"auto_wizard_success":true' ||
    die "the autowizard did not run"
echo "Zammad is up and seeded"

step "only zammad-nginx publishes a port, on loopback"
# `->` marks a published port; a bare `5432/tcp` is only what the image declares.
published="$($ENGINE ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Names}} {{.Ports}}' | grep -e '->' || true)"
echo "$published"
[ "$(echo "$published" | wc -l)" -eq 1 ] || die "more than one container publishes a port"
echo "$published" | grep -q 'zammad-nginx' || die "the published port is not zammad-nginx's"
echo "$published" | grep -q '127.0.0.1:' || die "zammad-nginx does not publish on loopback"

step "the edge proxy: the documented snippet, in front of Zammad"
# The same `X-Forwarded-For $remote_addr` (overwrite, not append) and `Authorization` rule that
# docs/operate/first-deploy-proxy-and-storage.md#proxy-settings tells an operator to configure.
# Host network, so it reaches Zammad's loopback port the way a real edge on the host does.
cat >"$TMP/edge.conf" <<E
worker_processes 1;
pid /tmp/edge.pid;
error_log /dev/stderr;
events { worker_connections 64; }
http {
    access_log off;
    map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }
    server {
        listen 127.0.0.1:$EDGE_PORT;
        if (\$http_authorization != "") { return 403; }
        location / {
            proxy_http_version 1.1;
            proxy_set_header Host \$http_host;
            proxy_set_header X-Forwarded-For \$remote_addr;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection \$connection_upgrade;
            proxy_read_timeout 86400;
            proxy_pass http://127.0.0.1:$PORT;
        }
    }
}
E
chmod 0644 "$TMP/edge.conf"
$ENGINE run -d --rm --name "$PROJECT-edge" --label crew=boilerplate --network host --tmpfs /tmp \
    --entrypoint /usr/sbin/nginx -v "$TMP/edge.conf:/etc/edge.conf:ro" "$ZAMMAD_IMAGE" -c /etc/edge.conf -g 'daemon off;' >/dev/null
for _ in $(seq 1 20); do curl -fsS "$EDGE/api/v1/getting_started" >/dev/null 2>&1 && break; sleep 1; done

step "the session list shows the real client address"
shown="$(signed_in_address real --interface "$CLIENT_ADDRESS")"
echo "recorded: $shown"
[ "$shown" = "$CLIENT_ADDRESS" ] || die "expected $CLIENT_ADDRESS in the session list, found '$shown'"

step "a forged X-Forwarded-For does not change it"
shown="$(signed_in_address forged --interface "$CLIENT_ADDRESS" -H "X-Forwarded-For: $FORGED_ADDRESS")"
echo "recorded: $shown"
[ "$shown" = "$CLIENT_ADDRESS" ] || die "a forged X-Forwarded-For changed the recorded address to '$shown'"

step "any Authorization header is refused at the edge"
code="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Authorization: Token token=anything' "$EDGE/api/v1/users/me")"
[ "$code" = 403 ] || die "expected 403 for an Authorization header, got $code"
code="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Authorization: Basic ZHJpbGw6ZHJpbGw=' "$EDGE/api/v1/signshow")"
[ "$code" = 403 ] || die "expected 403 for basic auth, got $code"
echo "403 for a token and for basic auth; the sign-ins above sent none and worked"

step "Zammad's own screen sends no Authorization header (a real browser)"
# H7: the 403 above is only safe if the staff screen never sends the header. A real Chromium signs in through
# the edge and records every request (scripts/testing/helpdesk-legacy-ui.ts). No Chromium on this host is a
# failure, not a skip: set CHROMIUM_PATH.
chromium="${CHROMIUM_PATH:-$(command -v chromium chromium-browser google-chrome google-chrome-stable | head -n 1)}"
[ -n "$chromium" ] || die "no Chromium found: set CHROMIUM_PATH to a Chromium or Chrome binary"
DRILL_USERNAME=drill-admin@example.com DRILL_PASSWORD=Drill-Admin-Pass-2026 CHROMIUM_PATH="$chromium" \
    npx tsx scripts/testing/helpdesk-legacy-ui.ts "$EDGE" || die "the browser check failed"

step "the geo lookup is off"
# The setting the runbook tells an operator to empty; the seed file empties it the same way. Read through
# the admin session the real sign-in left behind.
geo="$(curl -fsS --interface "$CLIENT_ADDRESS" -c "$TMP/jar-real" -b "$TMP/jar-real" -H "X-CSRF-Token: $(sed -n -E 's/^[Cc][Ss][Rr][Ff]-[Tt]oken: *//p' "$TMP/headers-real" | tr -d '\r')" "$EDGE/api/v1/settings" |
    node -e '
        let body = "";
        process.stdin.on("data", (chunk) => { body += chunk; });
        process.stdin.on("end", () => {
            const setting = JSON.parse(body).find((s) => s.name === "geo_ip_backend");
            process.stdout.write(setting === undefined ? "missing" : JSON.stringify(setting.state_current.value));
        });
    ')"
[ "$geo" = '""' ] || die "geo_ip_backend should be empty, found $geo"
echo "geo_ip_backend is empty"

step "a second client stack, without the profile, comes up beside it"
# `app` is created, not started: the point is the networks. Both stacks have `helpdesk`, and only the
# stack running the profile has `helpdesk-edge` (a fixed subnet that a second one would clash with).
make_client "$OTHER" bundled
COMPOSE_PROFILES=bundled compose "$OTHER" up --no-start --no-deps app >/dev/null
$ENGINE network inspect "${PROJECT}_helpdesk" "${OTHER}_helpdesk" >/dev/null || die "a stack is missing its helpdesk network"
if $ENGINE network inspect "${OTHER}_helpdesk-edge" >/dev/null 2>&1; then die "a stack without the profile created helpdesk-edge"; fi
echo "both stacks have their own helpdesk network; the fixed edge network exists only where the profile runs"

PASS=1
