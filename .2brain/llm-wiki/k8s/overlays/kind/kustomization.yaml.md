---
source: k8s/overlays/kind/kustomization.yaml
source_sha256: 1b4b298f77e7859e0b42a836b263c4513bfc4567208af6f98a39dc7dc5861042
context_sha256: aa502e4d2b54fd02cd43e39d4885a7c2de2daf4ee3c5036878ab5c0d3acc533a
generated_at: 2026-11-22T01:39:39.047417+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/overlays/kind/kustomization.yaml

## Purpose
Kustomize overlay for the local `kind` test cluster. It composes the base manifests, the gateway component, and Envoy Gateway as the Gateway controller, all in the `boilerplate` namespace. It is explicitly not for real clusters: no TLS, a NodePort, and a throwaway Mongo.

## Key elements
- **`namespace: boilerplate`**: applied to all resources.
- **`resources`**: `../../base`, plus the local `gatewayclass.yaml` and `envoyproxy.yaml`.
- **`components`**: `../../components/gateway`.
- **Patch: Gateway `app`**: replaces `/spec/gatewayClassName` with `eg` (the component's Gateway names no class).
- **Patch: NetworkPolicy `allow-gateway`**: replaces `/spec/ingress/0/from/0` with a selector for the `envoy-gateway-system` namespace and pods labelled `gateway.envoyproxy.io/owning-gateway-name: app` and `owning-gateway-namespace: boilerplate`. This admits Envoy Gateway's proxy pods.
- **Patches: Deployments `worker` and `worker-heavy`**: set `/spec/replicas` to `0`.

## Relationships
- `k8s/base/kustomization.yaml` is pulled in via `../../base`. The `worker` and `worker-heavy` Deployments from `k8s/base/worker.yaml` and `k8s/base/worker-heavy.yaml` are patched to zero replicas.
- `k8s/components/gateway/kustomization.yaml` is included as a component. Its `k8s/components/gateway/gateway.yaml` (Gateway `app`) and `k8s/components/gateway/networkpolicy.yaml` (`allow-gateway`) are the patch targets.
- `k8s/overlays/kind/gatewayclass.yaml` and `k8s/overlays/kind/envoyproxy.yaml` are added as resources. The `eg` class name refers to the GatewayClass defined in `gatewayclass.yaml`.

## Notes
- The Envoy Gateway CRDs and controller must be installed first. `k8s/rig.sh` does this with a pinned release checked against a sha256.
- Workers are scaled to 0 because the rig has no broker (`base/app.env` sets no `NODE_RABBITMQ_URL`), so the app runs jobs in its own process. This saves about 0.5 GB on the single node. A cluster with a broker keeps the base's one replica.
- The NetworkPolicy patch uses a positional path (`ingress/0/from/0`), so it depends on the component's rule ordering.
