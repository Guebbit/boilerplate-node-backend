#!/usr/bin/env bash
# Boots the production image against a real Mongo and proves two things a unit test cannot:
#   1. the image starts fail-closed config included, and `/livez` answers, for the web entry and
#      the worker entry both;
#   2. the runtime user (`node`) cannot write under `src/` — the code is root-owned.
#
# Usage:  docker build -f docker/Dockerfile --target runtime -t boot-check . && docker/boot-check.sh boot-check
# CI (`boot` job in ci.yml) and a developer run the same script, so the proof cannot drift.
# Queue and cache are left out on purpose: they degrade, and `/livez` never touches them.
set -euo pipefail

image="${1:?usage: docker/boot-check.sh <image>}"
suffix="$$"
network="boot-check-net-${suffix}"
mongo="boot-check-mongo-${suffix}"
app="boot-check-app-${suffix}"
worker="boot-check-worker-${suffix}"
port="${BOOT_CHECK_PORT:-3999}"
secrets="$(mktemp -d)"

# Tears everything down, whatever happened above.
cleanup() {
    docker rm -f "$app" "$worker" "$mongo" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    rm -rf "$secrets"
}
trap cleanup EXIT

# One random secret file per `NODE_*_FILE` variable the app reads. World-readable on purpose: the
# container's `node` user is not the runner's uid, and the files are throwaway.
for name in token_access token_refresh totp pii webhook pseudonym metrics device_cookie; do
    head -c 48 /dev/urandom | base64 -w0 >"$secrets/$name"
done
chmod 755 "$secrets"
chmod 644 "$secrets"/*

docker network create "$network" >/dev/null
# The same pinned image the production compose runs (first `mongo:` line; the three are identical).
mongo_image="$(sed -n -E 's/^ +image: (docker.io\/library\/mongo:[^@ ]+@sha256:[0-9a-f]+).*/\1/p' "$(dirname "$0")/../compose.yaml" | head -1)"
docker run -d --name "$mongo" --network "$network" "$mongo_image" >/dev/null

# What `app` and `worker` both run with: the same image reads the same environment.
run_args=(
    --network "$network"
    -v "$secrets:/run/secrets:ro"
    -e NODE_ENV=production
    -e NODE_DB_URI="mongodb://${mongo}:27017/api"
    -e NODE_URL=https://api.example.com
    -e NODE_FRONTEND_URL=https://shop.example.com
    -e NODE_CORS_ORIGIN=https://shop.example.com
    -e NODE_DEVICE_COOKIE_SECRET_FILE=/run/secrets/device_cookie
    -e NODE_TOKEN_ACCESS_FILE=/run/secrets/token_access
    -e NODE_TOKEN_REFRESH_FILE=/run/secrets/token_refresh
    -e NODE_TOTP_ENCRYPTION_KEY_FILE=/run/secrets/totp
    -e NODE_PII_ENCRYPTION_KEY_FILE=/run/secrets/pii
    -e NODE_WEBHOOK_SECRET_ENCRYPTION_KEY_FILE=/run/secrets/webhook
    -e NODE_PSEUDONYM_KEY_FILE=/run/secrets/pseudonym
    -e NODE_METRICS_TOKEN_FILE=/run/secrets/metrics
    -e NODE_LEGAL_COUNTRY=IT
    -e NODE_SHOP_TIMEZONE=Europe/Rome
    -e NODE_LEGAL_NAME="Boot Check S.r.l."
    -e NODE_LEGAL_STREET="Via Roma 1"
    -e NODE_LEGAL_CITY=Bologna
    -e NODE_LEGAL_ZIP=40121
    -e NODE_SUPPORT_EMAIL=support@example.com
    -e NODE_LEGAL_PHONE="+39 051 555 0100"
    -e NODE_VAT_RATE_DEFAULT=0.22
    -e NODE_VAT_RATE_REDUCED=0.10
)

# No `--read-only` here, unlike the production compose: that flag alone would make the write check
# below pass, and this check is about who OWNS the code, not about the mount.
docker run -d --name "$app" -p "127.0.0.1:${port}:3000" "${run_args[@]}" "$image" >/dev/null

# The worker entry, same image: it must come up and answer its own loopback `/livez`. No broker is
# configured, so it consumes nothing; this proves the entry boots under the production config gate.
docker run -d --name "$worker" "${run_args[@]}" "$image" node --import tsx src/worker.ts >/dev/null

# Up to 90 s for the process to answer `/livez` (liveness only: never a dependency).
alive=0
for _ in $(seq 1 45); do
    if curl -fsS "http://127.0.0.1:${port}/livez" >/dev/null 2>&1; then
        alive=1
        break
    fi
    sleep 2
done
if [ "$alive" != 1 ]; then
    echo "boot-check: /livez never answered. Container log:" >&2
    docker logs "$app" >&2 || true
    exit 1
fi
echo "boot-check: /livez answered"

# The runtime user must not be able to rewrite the code it runs.
if docker exec "$app" sh -c 'touch /app/src/.boot-check-write 2>/dev/null'; then
    echo "boot-check: the runtime user can write under /app/src" >&2
    exit 1
fi
echo "boot-check: /app/src is not writable by $(docker exec "$app" id -un)"

# The worker answers `/livez` on its own loopback listener, `NODE_WORKER_PORT` (default 3010), not the API's 3000.
# It runs inside the container because the image has no curl.
worker_alive=0
for _ in $(seq 1 45); do
    if docker exec "$worker" node -e "fetch('http://127.0.0.1:3010/livez').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
        worker_alive=1
        break
    fi
    sleep 2
done
if [ "$worker_alive" != 1 ]; then
    echo "boot-check: the worker's /livez never answered. Container log:" >&2
    docker logs "$worker" >&2 || true
    exit 1
fi
echo "boot-check: the worker's /livez answered"
