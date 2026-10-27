#!/usr/bin/env bash
# Validates every observability config with the image of the compose file that mounts it, so a
# version bump of an image and a config the new version refuses cannot land separately.
#
#   bash docker/observability/validate-configs.sh
#
# Each tool's own check: `otelcol validate`, `loki -verify-config`, `alloy validate`,
# `promtail -check-syntax`, `caddy adapt`. Needs a container engine (`docker`, or the podman shim).
set -euo pipefail

cd "$(dirname "$0")/../.."

# The image a compose file names for a service's image prefix, e.g. `grafana/loki`. The repository
# is matched without its registry host, so `docker.io/grafana/loki` and `grafana/loki` both hit.
image_in() {
    local file="$1" repository="$2"
    sed -n -E "s#^ +image: (docker\.io/)?(${repository}:[^ ]+).*#\2#p" "$file" | head -1
}

# Runs a check on one config with one image; $1 names the check in the output, $2 the image, the
# rest is the `docker run` tail. The config folder is mounted read-only at /obs.
check() {
    local label="$1" image="$2"
    shift 2
    [ -n "$image" ] || { echo "validate-configs: no image found for $label" >&2; exit 1; }
    echo "== $label ($image)"
    docker run --rm -v "$PWD/docker/observability:/obs:ro" -v "$PWD/docker:/docker:ro" "$@" >/dev/null
}

dev=docker-compose.yml
prod=docker-compose.production.yml

otel="$(image_in "$dev" 'otel/opentelemetry-collector-contrib')"
check "otel-collector" "$otel" "$otel" validate --config=/obs/otel-collector.config.yaml

# Loki runs in both stacks with the one config, so both versions have to accept it.
for compose in "$dev" "$prod"; do
    loki="$(image_in "$compose" 'grafana/loki')"
    check "loki ($compose)" "$loki" "$loki" -config.file=/obs/loki.config.yaml -verify-config
done

alloy_dev="$(image_in "$dev" 'grafana/alloy')"
check "alloy dev" "$alloy_dev" "$alloy_dev" validate /obs/alloy.config.alloy

# Production loads a directory: the logs config plus the optional audit forwarder (empty by default).
alloy_prod="$(image_in "$prod" 'grafana/alloy')"
check "alloy production" "$alloy_prod" -v "$PWD/docker/observability/alloy.logs.config.alloy:/conf/logs.alloy:ro" \
    "$alloy_prod" validate /conf

promtail="$(image_in "$dev" 'grafana/promtail')"
for config in promtail.config.yaml promtail.podman.config.yaml; do
    check "promtail $config" "$promtail" "$promtail" -config.file="/obs/$config" -check-syntax
done

# `adapt` parses the Caddyfile without loading the certificates it names.
caddy="$(image_in "$dev" 'caddy')"
check "caddy" "$caddy" "$caddy" caddy adapt --config /docker/webhook-tester-tls.Caddyfile --adapter caddyfile

echo "validate-configs: all configs accepted"
