#!/usr/bin/env bash
# A real Kubernetes on this machine, to watch a real rolling restart of the app.
#
#   k8s/rig.sh up      build the image, create a kind cluster, install the Gateway controller, deploy
#   k8s/rig.sh drill   a rolling restart under steady traffic, a live stream across pods, then the network-policy checks
#   k8s/rig.sh down    delete the cluster
#   k8s/rig.sh run     up, then drill, then down: the cluster is deleted however it ends
#
# kind runs Kubernetes inside one container: rootless podman here, Docker on a GitHub runner
# (CONTAINER_ENGINE=docker, .github/workflows/k8s-rig.yml). The cluster is `boilerplate-rig`;
# it has its OWN kubeconfig (tmp/k8s-rig/kubeconfig), so it never touches your ~/.kube/config or
# your current context, and every kubectl below also names `--context`.
#
# `npm run k8s:rig -- up` etc. A cluster outlives the command that made it, so `run` is the form to
# use unattended: its trap deletes the cluster after a failed step or a Ctrl-C. A bare `up` that
# fails leaves the cluster for you to inspect; `down` removes it.
# Setup, the reasons for each step and how to undo it: docs/build/kubernetes-testing.md
set -euo pipefail

cd "$(dirname "$0")/.."

ENGINE="${CONTAINER_ENGINE:-podman}"
case "$ENGINE" in
    podman | docker) ;;
    *)
        printf 'K8S RIG FAILED: CONTAINER_ENGINE must be podman or docker, got "%s"\n' "$ENGINE" >&2
        exit 1
        ;;
esac

# kind reads this to pick its provider, and it is the engine itself. With it unset on a podman-only
# host kind falls back to docker and fails with a misleading "requires setting systemd property
# Delegate=yes".
# https://kind.sigs.k8s.io/docs/user/rootless/
export KIND_EXPERIMENTAL_PROVIDER="$ENGINE"
CLUSTER=boilerplate-rig
CONTEXT="kind-$CLUSTER"
NAMESPACE=boilerplate
IMAGE=localhost/boilerplate-app:rig
# The host port the cluster answers on. Inside this repo's own block (docs/build/pairing-and-ports.md).
PORT="${K8S_RIG_PORT:-3072}"
STATE="tmp/k8s-rig"
KUBECONFIG_FILE="$STATE/kubeconfig"

# Envoy Gateway: the newest release at least two weeks old on build day, fetched by URL and checked
# against a hash written here, never vendored. A new release: bump both lines, after reading its notes.
# https://github.com/envoyproxy/gateway/releases
EG_VERSION=v1.10.0
EG_SHA256=f87f4d59b983aa760da52a2a0002c612028106fe69beefdf3d30cfb03905944e
EG_URL="https://github.com/envoyproxy/gateway/releases/download/$EG_VERSION/install.yaml"

# Prints a step heading.
step() { printf '\n=== %s\n' "$*"; }

# Fails with a message.
die() {
    printf 'K8S RIG FAILED: %s\n' "$*" >&2
    exit 1
}

# kubectl against the rig and nothing else.
# https://kubernetes.io/docs/reference/kubectl/
k() { kubectl --kubeconfig "$KUBECONFIG_FILE" --context "$CONTEXT" "$@"; }

# Prints what a failed wait needs: pod states, then the last log lines of what is not Running.
diagnose() {
    printf '\n--- cluster state\n' >&2
    k get pods,jobs --all-namespaces -o wide >&2 || true
    for pod in $(k -n "$NAMESPACE" get pods --no-headers 2>/dev/null | awk '$3 != "Running" && $3 != "Completed" {print $1}'); do
        printf '\n--- logs of %s\n' "$pod" >&2
        k -n "$NAMESPACE" logs "$pod" --all-containers --tail=40 >&2 || true
    done
}

# Runs a command and, when it fails, prints the cluster state before failing.
checked() {
    "$@" || {
        diagnose
        die "$* failed"
    }
}

# Fails unless every tool the rig drives is installed.
need_tools() {
    local tool
    for tool in kind kubectl "$ENGINE" openssl curl sha256sum npx; do
        command -v "$tool" >/dev/null || die "$tool is not installed (docs/build/kubernetes-testing.md)"
    done
}

# Builds the runtime image here and loads it into the kind node, which has no registry to pull from.
# Docker: `kind load docker-image` reads the image from the Docker daemon.
# Podman: `podman save` + `kind load image-archive`, because there is no Docker daemon to read from.
# https://kind.sigs.k8s.io/docs/user/quick-start/#loading-an-image-into-your-cluster
load_image() {
    step "build $IMAGE and load it into the cluster"
    $ENGINE build -q -f docker/Dockerfile --target runtime -t "$IMAGE" . >/dev/null
    if [ "$ENGINE" = docker ]; then
        kind load docker-image "$IMAGE" --name "$CLUSTER"
        return
    fi
    rm -f "$STATE/app-image.tar"
    $ENGINE save --format docker-archive -o "$STATE/app-image.tar" "$IMAGE"
    kind load image-archive "$STATE/app-image.tar" --name "$CLUSTER"
    rm -f "$STATE/app-image.tar"
}

# Creates the one-node cluster from k8s/overlays/kind/kind-cluster.yaml, with the host port swapped in.
create_cluster() {
    step "create the kind cluster $CLUSTER (host port $PORT)"
    sed "s/hostPort: 3072/hostPort: $PORT/" k8s/overlays/kind/kind-cluster.yaml >"$STATE/kind-cluster.yaml"
    # --kubeconfig: write this cluster's credentials to our own file, not ~/.kube/config.
    # --wait: block until the control plane is Ready.
    kind create cluster --config "$STATE/kind-cluster.yaml" --kubeconfig "$KUBECONFIG_FILE" --wait 180s
}

# Installs Envoy Gateway from its pinned release and waits until its CRDs and controller are usable.
# --server-side --force-conflicts: the CRDs are too large for client-side apply's annotation.
# https://gateway.envoyproxy.io/docs/install/install-yaml/
install_gateway_controller() {
    step "install Envoy Gateway $EG_VERSION"
    local file="$STATE/envoy-gateway-$EG_VERSION.yaml"
    if [ ! -f "$file" ]; then curl -fsSL -o "$file" "$EG_URL"; fi
    echo "$EG_SHA256  $file" | sha256sum --check --status || {
        rm -f "$file"
        die "$EG_URL does not match the pinned sha256"
    }
    checked k apply --server-side --force-conflicts -f "$file"
    checked k wait --for=condition=Established --timeout=120s \
        crd/gateways.gateway.networking.k8s.io crd/httproutes.gateway.networking.k8s.io \
        crd/gatewayclasses.gateway.networking.k8s.io crd/envoyproxies.gateway.envoyproxy.io
    checked k -n envoy-gateway-system wait --for=condition=Available --timeout=300s deployment/envoy-gateway
}

# Creates the namespace, the secrets and the edge address, none of which live in the repo.
# Secrets are random per run and exist only in the cluster (docker/deploy-drill.sh does the same).
create_secrets_and_edge() {
    step "namespace, generated secrets and the edge address"
    k apply -f k8s/base/namespace.yaml >/dev/null
    local args=() name
    for name in token_access token_refresh totp_encryption_key pii_encryption_key \
        webhook_secret_encryption_key pseudonym_key metrics_token device_cookie_secret smtp_password; do
        args+=("--from-literal=$name=$(openssl rand -hex 32)")
    done
    # The integration secrets are optional: an empty value is unset (src/infrastructure/config/secret-files.ts).
    for name in payment_webhook_secret oauth_google_client_secret oauth_github_client_secret \
        antibot_altcha_secret antibot_turnstile_secret posthog_personal_api_key; do
        args+=("--from-literal=$name=")
    done
    k -n "$NAMESPACE" create secret generic app-secrets "${args[@]}" >/dev/null
    k -n "$NAMESPACE" create configmap edge-env \
        "--from-literal=NODE_URL=http://localhost:$PORT/" \
        "--from-literal=NODE_FRONTEND_URL=http://localhost:$PORT" \
        "--from-literal=NODE_CORS_ORIGIN=http://localhost:$PORT" >/dev/null
}

# Applies the data tier and the setup Job, waits for them, then applies the app. Compose says this
# with `depends_on: service_completed_successfully`; here the `boilerplate/stage` label splits the
# one kustomization in two (k8s/base/kustomization.yaml).
deploy() {
    step "data tier, then setup"
    checked k apply -k k8s/overlays/kind -l 'boilerplate/stage!=app'
    checked k -n "$NAMESPACE" wait --for=condition=complete --timeout=300s job/mongo-init
    checked k -n "$NAMESPACE" wait --for=condition=complete --timeout=300s job/setup
    step "app and cron"
    checked k apply -k k8s/overlays/kind -l 'boilerplate/stage=app'
    checked k -n "$NAMESPACE" rollout status deployment/app --timeout=360s
    checked k -n "$NAMESPACE" rollout status deployment/cron --timeout=360s
}

# Waits for Envoy's proxy Deployment, then for the app to answer THROUGH the edge. Never waits on the
# Gateway's `Programmed` condition: it needs a load balancer address, and rootless kind has none.
wait_for_edge() {
    step "the edge answers on 127.0.0.1:$PORT"
    local deadline=$((SECONDS + 300))
    until [ -n "$(k -n envoy-gateway-system get deployment -l gateway.envoyproxy.io/owning-gateway-name=app -o name 2>/dev/null)" ]; do
        [ "$SECONDS" -lt "$deadline" ] || {
            diagnose
            die "Envoy never created its proxy Deployment"
        }
        sleep 2
    done
    checked k -n envoy-gateway-system wait --for=condition=Available --timeout=300s \
        deployment -l gateway.envoyproxy.io/owning-gateway-name=app
    until [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/readyz" || true)" = 200 ]; do
        [ "$SECONDS" -lt "$deadline" ] || {
            diagnose
            die "GET /readyz through the edge never answered 200"
        }
        sleep 2
    done
    echo "GET http://127.0.0.1:$PORT/readyz -> 200"
}

# Fails unless a new cluster can be made: the tools exist, none is up already, the port is free.
# `run` calls it BEFORE arming its trap, so a cluster someone left up to inspect is never deleted.
preflight() {
    need_tools
    mkdir -p "$STATE"
    if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then die "$CLUSTER already exists: run k8s/rig.sh down first"; fi
    if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then die "port $PORT is already in use (K8S_RIG_PORT)"; fi
}

# Makes the cluster and deploys into it, after `preflight`.
provision() {
    create_cluster
    load_image
    install_gateway_controller
    create_secrets_and_edge
    deploy
    wait_for_edge
    printf '\nUP. The API answers on http://127.0.0.1:%s  (kubectl --kubeconfig %s --context %s)\n' \
        "$PORT" "$KUBECONFIG_FILE" "$CONTEXT"
}

# The `up` subcommand.
up() {
    preflight
    provision
}

# The `drill` subcommand: k8s/drill.ts does the work and exits non-zero when a check fails.
drill() {
    need_tools
    [ -f "$KUBECONFIG_FILE" ] || die "no cluster: run k8s/rig.sh up first"
    RIG_KUBECONFIG="$KUBECONFIG_FILE" RIG_CONTEXT="$CONTEXT" RIG_NAMESPACE="$NAMESPACE" RIG_PORT="$PORT" \
        npx tsx k8s/drill.ts
}

# The `down` subcommand: deletes the cluster and its state, and leaves nothing behind. Safe to run twice.
down() {
    command -v kind >/dev/null || die "kind is not installed"
    kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
    $ENGINE rm -f "$CLUSTER-control-plane" >/dev/null 2>&1 || true
    rm -rf "$STATE"
    echo "$CLUSTER removed"
}

# The `run` subcommand: up and drill, then down on the way out whatever happened (a failed step,
# Ctrl-C, a kill), but only once `preflight` has passed. `exit 130` turns the signal into an exit, which fires the EXIT trap once.
run() {
    preflight
    trap down EXIT
    trap 'exit 130' INT TERM
    provision
    drill
}

case "${1:-}" in
    run) run ;;
    up) up ;;
    drill) drill ;;
    down) down ;;
    *) die "usage: k8s/rig.sh up | drill | down | run" ;;
esac
