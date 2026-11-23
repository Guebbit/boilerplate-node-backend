---
source: k8s/components/gateway/httproute.yaml
source_sha256: ec9d7772886a63d60841f7699cde001115f0fadd62811e6260793c4e69719969
context_sha256: 754b2480b623fd78d4a33920399237915ff06ccb341a54ef85ee6b86af2b31bb
generated_at: 2026-11-22T01:38:36.209146+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/components/gateway/httproute.yaml

## Purpose
Gateway API `HTTPRoute` named `app` that sends all traffic to the `app` Service on port 3000. It is the routing half of the gateway component: it attaches to a Gateway and forwards everything to the application backend.

## Key elements
- `kind: HTTPRoute` (`gateway.networking.k8s.io/v1`), `metadata.name: app`.
- `spec.parentRefs` – attaches the route to the Gateway named `app`.
- `spec.rules` – a single rule with no matches, so it catches all requests. Its `backendRefs` target Service `app` on port `3000`.

## Relationships
- `k8s/components/gateway/gateway.yaml`: `parentRefs: app` refers to the Gateway defined there, which is assumed to be named `app`.
- `k8s/base/app.yaml`: `backendRefs: app:3000` refers to the `app` Service from the base manifests.
- `k8s/components/gateway/kustomization.yaml`: the component's kustomization is the neighbor that bundles this route with the Gateway.

## Notes
- The header comment explains the readiness behavior. A Service's endpoints include only Ready pods, and the controller reads those endpoints. A pod whose `/readyz` returns 503 is therefore removed from the route.
- The route has no hostnames, path matches, or weights, so every request goes to the one backend.
