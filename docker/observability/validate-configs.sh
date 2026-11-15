#!/usr/bin/env bash
# Validates the configs that production runs (Loki, Alloy) with the image of the compose file that
# mounts them, so a version bump of an image and a config the new version refuses cannot land
# separately. Dev-only configs are not checked: a bad one fails at once on `compose up`.
#
#   bash docker/observability/validate-configs.sh
#
# Each tool's own check: `loki -verify-config`, `alloy validate`. Needs a container engine (`docker`, or the podman shim).
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
    docker run --rm -v "$PWD/docker/observability:/obs:ro" "$@" >/dev/null
}

dev=compose.override.yaml
prod=compose.production.yaml

# Loki runs in both stacks with the one config, so both versions have to accept it.
for compose in "$dev" "$prod"; do
    loki="$(image_in "$compose" 'grafana/loki')"
    check "loki ($compose)" "$loki" "$loki" -config.file=/obs/loki.config.yaml -verify-config
done

# Production loads a directory: the logs config plus the optional audit forwarder (empty by default).
alloy_prod="$(image_in "$prod" 'grafana/alloy')"
check "alloy production" "$alloy_prod" -v "$PWD/docker/observability/alloy.logs.config.alloy:/conf/logs.alloy:ro" \
    "$alloy_prod" validate /conf

echo "validate-configs: all configs accepted"
