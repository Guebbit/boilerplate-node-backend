---
source: k8s/overlays/kind/envoyproxy.yaml
source_sha256: 65887fb0837ce6dd9ca8395bdf0baa8b031dd064dcb3104e1c9db6b92c05f59e
context_sha256: 790f29eabf1ffe9c17d1d5582f4e95b7bc5eeacc15adccb04aad22979057197c
generated_at: 2026-11-22T01:39:14.398493+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/overlays/kind/envoyproxy.yaml

## Purpose
Defines an Envoy Gateway `EnvoyProxy` resource named `rig` that configures how the Envoy data-plane Service is created in the kind overlay. Rootless kind has no load balancer, so a Gateway never reaches `Programmed` and a `LoadBalancer` Service would stay `<pending>`. The file therefore makes Envoy's Service a `NodePort` on a fixed port.

## Key elements
- `kind: EnvoyProxy` (`gateway.envoyproxy.io/v1alpha1`), `metadata.name: rig`: the Envoy Gateway configuration object.
- `spec.provider.type: Kubernetes`: uses the Kubernetes provider.
- `envoyService.type: NodePort`: replaces the default LoadBalancer Service type.
- `envoyService.patch` (`type: StrategicMerge`): merges `spec.ports` by `port`. The entry `port: 80` gains `nodePort: 30080`. The controller-generated Service keeps its listener and only adds the node port.

## Relationships
- `kind-cluster.yaml`: maps the fixed node port (30080) to the host, so traffic reaches Envoy from outside the cluster. The two files must agree on that port.
- `gatewayclass.yaml`: a GatewayClass is the usual place to reference an `EnvoyProxy` through `parametersRef`. That link is not visible in this file, so check `gatewayclass.yaml` for it.
- `kustomization.yaml`: lists this file as a resource of the kind overlay, as the neighbor graph implies.

## Notes
- The fixed `nodePort: 30080` is a coupling point. Changing it here requires the matching change in `kind-cluster.yaml`.
- Because the patch merges by `port`, it only applies to the listener on port 80. Other listener ports would not get a `nodePort`.
