---
source: k8s/base/setup.yaml
source_sha256: a951f274f50dfcfc6ebc0dbe33f4352c90b187341e20feaca4571083b4117e19
context_sha256: d486d3c49c09c11d2032b1a0298a4aac82730a87e70f71d7b1dd45f8899ea0a8
generated_at: 2026-11-22T01:37:54.811039+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/setup.yaml

## Purpose
A Kubernetes `Job` that runs the database indexes sync and access bootstrap once per release, before the app rolls out. It is the Kubernetes counterpart of the `setup` service in `compose.production.yaml`. It needs only Mongo: no Redis, no volume, and no upload secret beyond the keys the config loader requires.

## Key elements
- **Job `setup`**: `backoffLimit: 6`, `restartPolicy: OnFailure`. The pod is labeled `app.kubernetes.io/name: setup`.
- **Container `setup`**: uses the `boilerplate-app` image. `args` runs `sh -c "node --import tsx scripts/db/sync-indexes.ts && node --import tsx scripts/db/bootstrap-access.ts"`. The image's dumb-init `ENTRYPOINT` is kept, and the command matches the compose file.
- **Environment**: `envFrom` loads the `app-env` and `edge-env` ConfigMaps. `NODE_SERVICE_NAME` is set to `api-setup`.
- **Resources**: requests are 100m CPU and 640Mi memory. The memory limit is 1Gi, with no CPU limit.
- **Hardening**:
  - Pod level: `runAsNonRoot` with uid and gid 1000, `seccompProfile: RuntimeDefault`, and `automountServiceAccountToken: false`.
  - Container level: `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, and all capabilities dropped.
- **Volumes**: an `emptyDir` `tmp` (64Mi limit) mounted at `/tmp`. The `app-secrets` Secret is mounted read-only at `/run/secrets` with mode `0444`.

## Relationships
- `compose.production.yaml`: the `setup` service there runs the same command. This Job is the Kubernetes equivalent.
- `k8s/base/kustomization.yaml`: the Kustomize base that includes this manifest.
- `k8s/base/mongo.yaml`: the Mongo deployment this Job depends on. It is the only datastore the Job uses.
- `k8s/base/networkpolicy.yaml`: network policies govern the Job pod's traffic to Mongo and other peers.

## Notes
- A Job's pod template is immutable. To rerun it with a new image, delete the Job and apply it again.
- `k8s/rig.sh` does not need to delete it, because `up` always starts a fresh cluster.
- The image name `boilerplate-app` is a bare placeholder here. The file does not show where it is resolved.
