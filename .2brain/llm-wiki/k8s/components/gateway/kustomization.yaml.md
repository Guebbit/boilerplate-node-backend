---
source: k8s/components/gateway/kustomization.yaml
source_sha256: c68eb902b756a65f83190e36b7a79f164e76d4f178bcde0c860a5760ff27bbda
context_sha256: a94d9a7019af9410c61f9d136354dae8c0351552ed13f70435588143e04dcb2f
generated_at: 2026-11-22T01:38:40.316507+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/components/gateway/kustomization.yaml

## Purpose
A Kustomize `Component` that bundles the Gateway API resources for public traffic: a Gateway (entry point) and an HTTPRoute (path-to-Service mapping), plus a NetworkPolicy. It is kept out of `base` so that `base` still applies on clusters without Gateway API CRDs. An overlay opts in by including this component and naming the GatewayClass.

## Key elements
- `kind: Component` (`kustomize.config.k8s.io/v1alpha1`): marks this as a reusable component rather than a standalone build.
- `resources`:
  - `gateway.yaml`: the Gateway.
  - `httproute.yaml`: the HTTPRoute.
  - `networkpolicy.yaml`: the NetworkPolicy.

## Relationships
- Aggregates `gateway.yaml`, `httproute.yaml` and `networkpolicy.yaml` from the same directory. They are only deployed via this file.
- `k8s/overlays/kind/kustomization.yaml` is the neighbor that consumes the component. Per the header comment, overlays enable it and supply the GatewayClass.

## Notes
- Because it is a component, it is activated from an overlay's `components:` list, not from `resources:`.
- The GatewayClass is not set in this file. The header comment says the overlay names it.
- The header comment says any conforming Gateway API controller reads the same two objects (Gateway and HTTPRoute).
