---
source: k8s/base/app.yaml
source_sha256: abf202111026905dd8d5c77f6a28fa498e4e98a7a7b5584b630609ffddb7a463
context_sha256: ddb63123fcb5adec2762ba1057ed2d0dc74de87a71f894c30624cf048ceb4932
generated_at: 2026-11-22T01:36:37.260384+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/app.yaml

## Purpose
Kubernetes base manifest for the HTTP API (`app`). It defines a 3-replica Deployment, a ClusterIP Service in front of it, and a shared PersistentVolumeClaim named `data`. Its comments tie each setting back to the equivalent in the compose setup, so the two deployments stay consistent.

## Key elements
- **Deployment `app`**
  - 3 replicas with a `RollingUpdate` strategy of `maxSurge: 1` and `maxUnavailable: 0`, so no copy is removed before its replacement is Ready.
  - `automountServiceAccountToken: false`. The app never talks to Kubernetes, and this frees `/var/run/secrets` to avoid colliding with `/run/secrets`.
  - `terminationGracePeriodSeconds: 30`. This covers the 5 s lame-duck delay (`NODE_SHUTDOWN_DELAY_MS`) plus up to 15 s of drain (`NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`).
  - Pod security context: non-root, uid/gid 1000 (the image's `node` user), `fsGroup: 1000`, `RuntimeDefault` seccomp.
  - Container `app` (image `boilerplate-app`):
    - Config comes from `envFrom` the ConfigMaps `app-env` and `edge-env`.
    - Port `http` is 3000.
    - Requests are 100m CPU and 640Mi memory. The memory limit is 1Gi, and there is deliberately no CPU limit.
    - Container security context: read-only root filesystem, no privilege escalation, all capabilities dropped.
    - Uses `args`, not `command`, to keep the image's `dumb-init` ENTRYPOINT as PID 1.
- **Probes**
  - `startupProbe` on `/livez`: 5 s period, 36 failures allowed, so a 3-minute boot budget.
  - `livenessProbe` on `/livez`: 10 s period, process-only, never dependency-based.
  - `readinessProbe` on `/readyz`: 2 s period, fails on the first miss, so a draining pod leaves the endpoints quickly.
- **Volumes**
  - `tmp`: an `emptyDir` limited to 64Mi, mounted at `/tmp`.
  - `secrets`: Secret `app-secrets`, mounted read-only at `/run/secrets` with mode 0444.
  - `data`: the PVC, mounted at three subPaths: `/app/public/images`, `/app/tmp/storage`, `/app/tmp/quarantine`.
- **Service `app`**: ClusterIP on port 3000, targeting the named port `http`. Only Ready pods are behind it.
- **PVC `data`**: `ReadWriteOnce`, 1Gi.

## Relationships
- `src/infrastructure/runtime/server-lifecycle.ts` implements the SIGTERM, lame-duck, drain, exit sequence that `terminationGracePeriodSeconds` must exceed.
- `docker/Dockerfile` supplies the `node` user (uid/gid 1000), the `dumb-init` ENTRYPOINT, the mount directories, and the `INSTALL_CHROMIUM=false` build argument.
- `compose.production.yaml` is the compose counterpart. This file mirrors its `x-hardening` and its three named volumes, which become subPaths of one claim here.
- `docs/operate/health-checks.md` explains the liveness vs. readiness rules the probes follow.
- `k8s/base/kustomization.yaml` includes this file in the base. The ConfigMaps `app-env` and `edge-env` and the Secret `app-secrets` come from elsewhere in the kustomization.
- The sibling workloads and policies (`worker.yaml`, `worker-heavy.yaml`, `cron.yaml`, `cache.yaml`, `mongo.yaml`, `networkpolicy.yaml`) are part of the same base.
- `k8s/components/gateway/httproute.yaml` and `k8s/components/gateway/networkpolicy.yaml` expose and allow traffic to the `app` Service.

## Notes
- The `data` PVC is `ReadWriteOnce`. That works only because the pods share one node, as on the one-node rig. A multi-node cluster needs a ReadWriteMany class or an object store (`src/infrastructure/adapters/image-store.ts`).
- The memory sizing is measured, not arbitrary. NODE_OPTIONS in `app.env` caps the heap at 640 so Node collects before the kernel OOM-kills the pod. 512Mi is OOMKilled at boot, and 768Mi would leave too little headroom above the peak.
- `/dev/shm` is not mounted because only Chromium (invoice PDFs) needs it. If `INSTALL_CHROMIUM` is enabled, add an in-memory `emptyDir` at `/dev/shm` at the same time.
- An `emptyDir` cannot be `noexec`, unlike compose's tmpfs. The root stays read-only, and nothing runs files from `/tmp`.
