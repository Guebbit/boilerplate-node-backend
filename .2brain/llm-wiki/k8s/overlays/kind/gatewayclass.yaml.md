---
source: k8s/overlays/kind/gatewayclass.yaml
source_sha256: 2d84064dddb805355029428a5872c411c9f072ac3aca758cc99ea7582c493c53
context_sha256: eb3011b930c8d8c559fa74ba49f1e341b4ed1082d63f302debe4f19fdac7f8a1
generated_at: 2026-11-22T01:39:18.543421+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/overlays/kind/gatewayclass.yaml

## Purpose
Declares the Gateway API `GatewayClass` that Envoy Gateway serves in the kind (local cluster) overlay. It binds the class to an `EnvoyProxy` resource that supplies the proxy's settings.

## Key elements
- `GatewayClass` named `eg` (`gateway.networking.k8s.io/v1`).
- `spec.controllerName: gateway.envoyproxy.io/gatewayclass-controller`: the controller that handles this class, which is Envoy Gateway's.
- `spec.parametersRef`: points to the `EnvoyProxy` named `rig` (group `gateway.envoyproxy.io`) in the `boilerplate` namespace.

## Relationships
- `envoyproxy.yaml`: the `parametersRef` targets the `EnvoyProxy` named `rig` in namespace `boilerplate`. The header comment calls it the settings for this class. Its name and namespace must match those values.
- `kustomization.yaml`: the kind overlay's kustomization presumably lists this file as a resource so it is applied with the rest of the overlay. That file is not shown here.

## Notes
- `GatewayClass` is cluster-scoped, so it has no `metadata.namespace`. The namespace appears only in `parametersRef`.
- Any `Gateway` that uses this class must reference `gatewayClassName: eg`.
