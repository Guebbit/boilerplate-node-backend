---
source: k8s/base/networkpolicy.yaml
generated_at: 2026-11-22T01:37:42.846797+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/networkpolicy.yaml

## Purpose
Defines the base Kubernetes NetworkPolicies that restrict pod-to-pod ingress inside the namespace. It starts from default-deny and then opens only the paths MongoDB and Redis need. Egress is deliberately left open, because the app needs the SMTP host, OAuth providers and webhook subscribers.

## Key elements
- **`default-deny-ingress`**: empty `podSelector` with `policyTypes: [Ingress]` and no rules, so every pod in the namespace refuses incoming connections by default.
- **`allow-mongo`**: selects pods labelled `app.kubernetes.io/name: mongo` and allows TCP 27017 from pods whose `app.kubernetes.io/name` is one of `app`, `worker`, `worker-heavy`, `cron`, `setup`, `mongo-init` or `mongo`. `mongo` is included because a one-member replica set connects to its own address. `setup` and `mongo-init` are the Jobs that run before the workloads.
- **`allow-cache`**: selects pods labelled `app.kubernetes.io/name: cache` (the Redis `cache` Service) and allows TCP 6379 from `app`, `worker`, `worker-heavy` and `cron`.

## Relationships
- Selects on the `app.kubernetes.io/name` labels of the workloads defined in `app.yaml`, `worker.yaml`, `worker-heavy.yaml`, `cron.yaml`, `setup.yaml`, `mongo.yaml` and `cache.yaml`. Those manifests must keep matching label values.
- `kustomization.yaml` is the neighbor that would include this file in the base.
- `docs/operate/deployment-hardening.md` is referenced for default-deny egress (recipe 5).
- `k8s/components/gateway/networkpolicy.yaml` is a sibling policy file in the gateway component. Because of default-deny, any ingress to `app` has to be allowed by a policy elsewhere. This file contains no such rule.

## Notes
- Needs a CNI that enforces NetworkPolicy. On one that does not (for example flannel alone), the objects are accepted but have no effect. The file's header comment says `k8s/drill.ts` checks that the rig's CNI really drops the traffic.
- Only pod-to-pod traffic is filtered. Kubelet probes come from the node and are not filtered.
- Ingress only: egress stays open. Default-deny egress is covered in recipe 5 of the deployment hardening doc.
- Adding a new workload that talks to Mongo or Redis requires adding its label to the matching `values` list.
