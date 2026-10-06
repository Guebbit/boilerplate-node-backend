#!/usr/bin/env bash
# Boots the production image against a real Mongo and proves two things a unit test cannot:
#   1. the image starts fail-closed config included, and `/livez` answers;
#   2. the runtime user (`node`) cannot write under `src/` — the code is root-owned.
#
# Usage:  docker/boot-check.sh <image>
# CI (`boot` job in ci.yml) and a developer run the same script, so the proof cannot drift.
# Queue and cache are left out on purpose: they degrade, and `/livez` never touches them.
set -euo pipefail

image="${1:?usage: docker/boot-check.sh <image>}"
suffix="$$"
network="boot-check-net-${suffix}"
mongo="boot-check-mongo-${suffix}"
app="boot-check-app-${suffix}"
port="${BOOT_CHECK_PORT:-3999}"
secrets="$(mktemp -d)"

# Tears everything down, whatever happened above.
cleanup() {
    docker rm -f "$app" "$mongo" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    rm -rf "$secrets"
}
trap cleanup EXIT

# One random secret file per `NODE_*_FILE` variable the app reads. World-readable on purpose: the
# container's `node` user is not the runner's uid, and the files are throwaway.
for name in token_access token_refresh totp pii webhook pseudonym metrics; do
    head -c 48 /dev/urandom | base64 -w0 >"$secrets/$name"
done
chmod 755 "$secrets"
chmod 644 "$secrets"/*

docker network create "$network" >/dev/null
docker run -d --name "$mongo" --network "$network" docker.io/library/mongo:8@sha256:d731d77bfd7afd66bd487bdf627b5bf7ce4c3602ec461d635977021db529ebbc >/dev/null

# No `--read-only` here, unlike the production compose: that flag alone would make the write check
# below pass, and this check is about who OWNS the code, not about the mount.
docker run -d --name "$app" --network "$network" \
    -p "127.0.0.1:${port}:3000" \
    -v "$secrets:/run/secrets:ro" \
    -e NODE_ENV=production \
    -e NODE_ENABLE_CLUSTERING=0 \
    -e NODE_DB_URI="mongodb://${mongo}:27017/api" \
    -e NODE_URL=https://api.example.com \
    -e NODE_FRONTEND_URL=https://shop.example.com \
    -e NODE_CORS_ORIGIN=https://shop.example.com \
    -e NODE_DEVICE_COOKIE_SECRET="$(head -c 48 /dev/urandom | base64 -w0)" \
    -e NODE_TOKEN_ACCESS_FILE=/run/secrets/token_access \
    -e NODE_TOKEN_REFRESH_FILE=/run/secrets/token_refresh \
    -e NODE_TOTP_ENCRYPTION_KEY_FILE=/run/secrets/totp \
    -e NODE_PII_ENCRYPTION_KEY_FILE=/run/secrets/pii \
    -e NODE_WEBHOOK_SECRET_ENCRYPTION_KEY_FILE=/run/secrets/webhook \
    -e NODE_PSEUDONYM_KEY_FILE=/run/secrets/pseudonym \
    -e NODE_METRICS_TOKEN_FILE=/run/secrets/metrics \
    -e NODE_SHOP_COUNTRY=IT \
    -e NODE_SHOP_LEGAL_NAME="Boot Check S.r.l." \
    -e NODE_SHOP_STREET="Via Roma 1" \
    -e NODE_SHOP_CITY=Bologna \
    -e NODE_SHOP_ZIP=40121 \
    -e NODE_SHOP_EMAIL=shop@example.com \
    -e NODE_SHOP_PHONE="+39 051 555 0100" \
    -e NODE_VAT_RATE_DEFAULT=0.22 \
    -e NODE_VAT_RATE_REDUCED=0.10 \
    "$image" >/dev/null

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
