---
source: k8s/components/gateway/networkpolicy.yaml
source_sha256: 2a8a71ec7d223d147c1f787478cc4687b77990217801dfb6eda0a7e6183f6a60
context_sha256: d3eb04c1a987683288414d4c2d6ffc76229cc5f9cb2f7059db547420ff24ccba
generated_at: 2026-11-22T01:38:50.987985+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/components/gateway/networkpolicy.yaml

## Purpose
A Kustomize-component `NetworkPolicy` that lets the Gateway's proxy pods reach the `app` pods on TCP port 3000. The base policy (`k8s/base/networkpolicy.yaml`) denies all other ingress, so this is the only allowed path from the Gateway to `app`.

## Key elements
- **`allow-gateway`**: `NetworkPolicy` with `policyTypes: [Ingress]`.
- **`spec.podSelector`**: selects the pods labeled `app.kubernetes.io/name: app`.
- **Single `from` entry** with both a `namespaceSelector` and a `podSelector`. The two selectors combine as AND, so only the proxy pods in the controller's namespace match.
- **`ports`**: TCP 3000 only.
- **Placeholders**: `kubernetes.io/metadata.name: set-by-the-overlay` and the label `set-by-the-overlay: set-by-the-overlay`. These are deliberately non-functional values.

## Relationships
- **`k8s/base/networkpolicy.yaml`**: denies the remaining ingress to `app`. This file adds the one exception for the Gateway.
- **`k8s/base/app.yaml`**: defines the `app` workload. The policy targets its pods by label and its HTTP port, 3000.
- **`k8s/components/gateway/kustomization.yaml`**: the component that includes this policy.
- **`k8s/overlays/kind/kustomization.yaml`**: patches the two placeholder selectors with the namespace and labels used by Envoy Gateway.

## Notes
- The file doesn't work as-is. The proxy runs in the controller's namespace with labels the controller chooses, so every overlay that uses this component must patch both placeholder selectors. Until it does, the policy matches nothing real.
- Keep the namespace and pod selectors in a single `from` entry. Splitting them into two entries would turn the AND into an OR. That would allow every pod in the namespace plus every pod with those labels in any namespace.
