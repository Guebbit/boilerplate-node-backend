---
source: k8s/components/gateway/gateway.yaml
source_sha256: 33fdef81443210edb5bd339f56409e0ea7a374d079ce0fd39978af5b7eae0234
context_sha256: d5e14932598e051f7c8035c6567dcad53b290f74c8e07b78bcbea24fb9c482e0
generated_at: 2026-11-22T01:38:31.032860+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/components/gateway/gateway.yaml

## Purpose
Defines the Gateway API `Gateway` named `app`, the single entry point for traffic into the rig. It exposes one plain-HTTP listener. TLS is deliberately left out: a real deployment supplies its own Gateway with a certificate and an https listener.

## Key elements
- `kind: Gateway` (`gateway.networking.k8s.io/v1`), `metadata.name: app`.
- `spec.gatewayClassName: set-by-the-overlay`: a placeholder that every overlay must replace with the class of the controller it installs.
- Listener `http`: protocol `HTTP`, port `80`.
- `allowedRoutes.namespaces.from: Same`: only routes in the Gateway's own namespace can attach.

## Relationships
- `k8s/components/gateway/kustomization.yaml` includes this file as part of the gateway component.
- `k8s/components/gateway/httproute.yaml` is the companion route. Because of `from: Same`, routes can attach to this Gateway only from the same namespace.
- `k8s/overlays/kind/kustomization.yaml` is an overlay that must supply the real `gatewayClassName`, replacing the placeholder, for the controller it installs.

## Notes
- The placeholder `set-by-the-overlay` is not a valid class on its own. An overlay that does not patch it leaves the Gateway without a working controller.
- There is no TLS or https listener here, so this file is suited to the rig, not to production as written.
