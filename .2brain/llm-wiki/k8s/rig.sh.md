---
source: k8s/rig.sh
source_sha256: c5bbae108c1d1c44ce359b10c5f54d6659512ae656f484e0174264b6751b5b3c
context_sha256: 97ef15715c45237b369c80700982e17936d60c5d3db427a74c78434461fe1056
generated_at: 2026-11-22T01:40:03.090564+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/rig.sh

## Purpose
A Bash driver that stands up a real Kubernetes cluster (via `kind`) on the local machine so a rolling restart of the app can be observed and tested against real pods. It builds the runtime image, creates the cluster, installs Envoy Gateway, deploys the app, and runs a drill. It runs on rootless podman locally and on Docker in CI (`CONTAINER_ENGINE=docker`).

## Key elements
- **Subcommands** (dispatched by the `case` at the bottom):
  - `up`: runs `preflight`, then `provision`.
  - `drill`: runs a TypeScript drill script through `npx tsx`. It passes `RIG_KUBECONFIG`, `RIG_CONTEXT`, `RIG_NAMESPACE` and `RIG_PORT` as environment variables.
  - `down`: deletes the cluster, removes the `boilerplate-rig-control-plane` container, and removes `tmp/k8s-rig`. It is safe to run twice.
  - `run`: runs `preflight`, then arms an EXIT trap on `down`, then runs `provision` and `drill`. INT and TERM are turned into `exit 130`.
- **Configuration**: `CONTAINER_ENGINE` (podman or docker, default podman; anything else is rejected), `K8S_RIG_PORT` (default 3072), cluster `boilerplate-rig`, context `kind-boilerplate-rig`, namespace `boilerplate`, image `localhost/boilerplate-app:rig`. State lives in `tmp/k8s-rig`, including its own kubeconfig.
- **Helpers**:
  - `k`: kubectl pinned to the rig's kubeconfig and context.
  - `step`, `die`: print a step heading and fail with a message.
  - `diagnose`: prints pod and job state, plus the last 40 log lines of pods that are not Running or Completed.
  - `checked`: runs a command and calls `diagnose` before failing.
  - `need_tools`: checks that `kind`, `kubectl`, the engine, `openssl`, `curl`, `sha256sum` and `npx` are installed.
- **Provisioning steps**:
  - `preflight`: checks the tools, that no cluster of that name exists, and that the port is free.
  - `create_cluster`: builds the cluster from `k8s/overlays/kind/kind-cluster.yaml`, with the host port swapped in using `sed`.
  - `load_image`: builds `docker/Dockerfile` (target `runtime`) and loads it into the node. It uses `kind load docker-image` on Docker, and `podman save` plus `kind load image-archive` on podman.
  - `install_gateway_controller`: downloads the pinned Envoy Gateway install manifest (`EG_VERSION`, `EG_SHA256`), checks its hash, applies it server-side, and waits for the CRDs and the controller.
  - `create_secrets_and_edge`: applies the namespace manifest. It then creates the `app-secrets` secret with random `openssl rand -hex 32` values, leaves the optional integration secrets empty, and creates the `edge-env` ConfigMap with localhost URLs.
  - `deploy`: applies `k8s/overlays/kind` in two stages by label. First comes `boilerplate/stage!=app` (the data tier), then it waits for jobs `mongo-init` and `setup`. Then comes `boilerplate/stage=app`, then it waits for rollouts of `app` and `cron`.
  - `wait_for_edge`: waits for Envoy's proxy Deployment, then polls `GET /readyz` through `127.0.0.1:$PORT` until it returns 200.

## Relationships
- `k8s/overlays/kind/kind-cluster.yaml`: the kind cluster config. `create_cluster` copies it into the rig's state directory, replacing the literal `hostPort: 3072` with `$PORT`. That literal must stay in the file for the swap to work.
- `k8s/base/kustomization.yaml`: the base that `k8s/overlays/kind` builds on. The script applies the overlay with `-k`. The `boilerplate/stage` label on its resources is what lets `deploy` split the apply into data-tier and app stages, standing in for Compose's `depends_on: service_completed_successfully`.

## Notes
- The rig uses its own kubeconfig (`tmp/k8s-rig/kubeconfig`) and passes `--context` on every kubectl call, so it never touches your default kubeconfig.
- `KIND_EXPERIMENTAL_PROVIDER` is exported as the engine. Without it, kind on a podman-only host falls back to docker and fails with a misleading "requires setting systemd property Delegate=yes" error.
- A bare `up` that fails leaves the cluster in place for inspection, and `down` removes it. `run` is the form for unattended use. `preflight` runs before the trap is armed, so a cluster someone left up to inspect is never deleted.
- `wait_for_edge` deliberately does not wait on the Gateway's `Programmed` condition. That condition needs a load balancer address, which rootless kind does not have.
- The Envoy Gateway manifest is downloaded and pinned by SHA-256, not vendored. A bad hash deletes the cached file and aborts. To upgrade, bump `EG_VERSION` and `EG_SHA256` together.
- Secrets are random per run and exist only in the cluster.
- The CRDs are applied with `--server-side --force-conflicts` because they are too large for client-side apply's annotation.
