---
source: k8s/base/cron.yaml
source_sha256: 04b53f1a326e2a541b06d28c79e06f55f03e3de0fcd8bacf1f4c99edfcbad908
context_sha256: ea737c9e547d424b3aa747c1a6a71f9cde7f6775ffda33fd268e07c9d246b335
generated_at: 2026-11-22T01:37:06.147796+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/cron.yaml

## Purpose
Kubernetes Deployment that runs `supercronic` as the single scheduler for the module-declared cron jobs, using the app image. It mirrors the `cron` service in `compose.production.yaml`. A Deployment is used instead of per-schedule CronJobs so every job shares one environment, the same volumes and one health check.

## Key elements
- **Deployment `cron`**: `replicas: 1` with `strategy: Recreate`, so the old and new scheduler never run side by side. Labels `app.kubernetes.io/name: cron` and `boilerplate/stage: app`.
- **Container command** (`args`, keeping dumb-init as PID 1): runs `node --import tsx scripts/ops/check-config.ts`, then `exec supercronic -passthrough-logs -prometheus-listen-address 127.0.0.1:9746 /app/crontab`. The config check runs first because supercronic would otherwise stay alive and look healthy while every job refuses a bad environment.
- **Environment**: `envFrom` the `app-env` and `edge-env` ConfigMaps, plus `NODE_SERVICE_NAME=api-cron`.
- **Resources**: requests are 50m CPU and 640Mi memory, and the memory limit is 4Gi. The limit has to cover the scheduler plus all concurrently running jobs, each a separate `node` process of about 560 MB. A 1Gi limit was OOMKilled.
- **Liveness probe**: an `exec` probe running `node -e fetch('http://127.0.0.1:9746/health')`. It is not `httpGet`, because supercronic listens on loopback, which the kubelet cannot reach. It uses a 30s initial delay, a 30s period, a 5s timeout and a failure threshold of 3.
- **Security**: runs as non-root uid/gid 1000 with `fsGroup` 1000 and the `RuntimeDefault` seccomp profile. The root filesystem is read-only, privilege escalation is disallowed, all capabilities are dropped, and the service account token is not mounted.
- **Volumes**:
  - `tmp`: an `emptyDir` limited to 64Mi, mounted at `/tmp`.
  - `secrets`: the `app-secrets` Secret, read-only at `/run/secrets` with mode 0444.
  - `data`: the PVC `data`, mounted via subPaths `images`, `storage` and `quarantine` at `/app/public/images`, `/app/tmp/storage` and `/app/tmp/quarantine`.
  - `crontab`: the `crontab` ConfigMap, mounted read-only at `/app/crontab` via subPath.

## Relationships
- **`compose.production.yaml`**: the `cron` service there uses the same command line and the same health check, and this file is its Kubernetes counterpart.
- **`k8s/base/app.yaml`**: shares the `app-env`, `edge-env` and `app-secrets` configuration, the `data` PVC and the `boilerplate-app` image. The jobs sweep the files the app writes.
- **`k8s/base/kustomization.yaml`**: expected to include this resource and to generate or supply the `crontab` ConfigMap, whose content is produced by `npm run regenerate` as `k8s/base/crontab`. The content of `kustomization.yaml` is not shown here.
- **`k8s/base/networkpolicy.yaml`**: network policies would select this pod by its labels (`boilerplate/stage: app` and the `cron` name label). The policy content is not shown here.

## Notes
- Keep exactly one replica. Two schedulers would run every job twice.
- Without the `data` mounts the jobs would walk empty paths and report nothing.
- `k8s/base/crontab` is generated, so edit the job declarations and run `npm run regenerate` instead of editing it by hand.
- The memory limit was set from observed OOMKills, so adding jobs that run at the same time may require raising it.
