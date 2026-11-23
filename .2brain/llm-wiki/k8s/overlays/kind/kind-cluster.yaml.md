---
source: k8s/overlays/kind/kind-cluster.yaml
source_sha256: 159ebf85168207db0f8bb0029d43f2cbff8172dc4cdc24a284bf118ed2b70722
context_sha256: 19426af956871d8205903e258f9517716634a2c334247c0d1cdd9cc5f4908292
generated_at: 2026-11-22T01:39:27.899038+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/overlays/kind/kind-cluster.yaml

## Purpose
Configuration for the single-node kind cluster that `k8s/rig.sh` creates. It is not a Kustomize resource; it is read by `kind create cluster --config`. It defines the cluster name, a pinned node image, and a host port mapping so the host can reach the cluster's ingress.

## Key elements
- `kind: Cluster` / `kind.x-k8s.io/v1alpha4`: kind cluster config schema.
- `name: boilerplate-rig`: the cluster name.
- `nodes`: a single `control-plane` node.
- `image: kindest/node:v1.35.8@sha256:...`: node image pinned by version and digest. kind's default image changes with each kind release, and kubectl tolerates only one minor version of skew.
- `extraPortMappings`: maps container port `30080` (TCP) to host port `3072`, bound to the host's loopback address only.

## Relationships
- `k8s/rig.sh`: runs `kind create cluster --config` on this file. It swaps the host port when `K8S_RIG_PORT` is set.
- `k8s/overlays/kind/envoyproxy.yaml`: `containerPort: 30080` is Envoy's NodePort as defined there. Traffic arriving on the mapped host port reaches Envoy through this mapping.

## Notes
- The two files must agree on port `30080`. Changing the NodePort in `envoyproxy.yaml` without updating it here breaks host access.
- The listen address is loopback only, so the cluster is not exposed to other machines.
- To upgrade Kubernetes, pick a new image and digest from the kind release notes, and keep the tag and digest together.
