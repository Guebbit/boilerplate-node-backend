---
source: k8s/base/worker-heavy.yaml
source_sha256: 7d98d2f027ab929fe102201ac9e2f097c8f8ac79ad781f094bb28a3c56d9cae9
context_sha256: ff0791298943d35963ec0f29b24fb5869637db8cc92e02e455845d5a18445dfb
generated_at: 2026-11-22T01:38:16.059127+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/worker-heavy.yaml

## Purpose
Kustomize base manifest for the `worker-heavy` queue consumer: a Deployment plus a metrics Service. It handles the CPU- and memory-bound jobs (image digest, whole-account export), one at a time under a memory cap, so bursts of uploads don't starve light jobs such as mail, which go to `worker`. It runs the same image and entry point as `worker`, and `NODE_WORKER_ROLE=heavy` is the only functional difference.

## Key elements
- **Deployment `worker-heavy`**
  - 1 replica, scaled manually with `kubectl scale`.
  - `RollingUpdate` with `maxSurge: 1` and `maxUnavailable: 0`, so the queue is never left unattended during a rollout.
  - Image `boilerplate-app`, with `args: [node, --import, tsx, src/worker.ts]`.
  - `args` is used instead of `command` so the image's dumb-init ENTRYPOINT stays PID 1 and SIGTERM still reaches Node.
- **Env**
  - `envFrom` loads the `app-env` and `edge-env` ConfigMaps.
  - `NODE_SERVICE_NAME=api-worker-heavy`.
  - `NODE_WORKER_ROLE=heavy`, which selects the heavy channels (`src/infrastructure/adapters/job-kinds.ts`).
  - `NODE_OPTIONS=--max-old-space-size=640`.
- **Resources**
  - Requests: 50m CPU and 640Mi memory.
  - Limit: 1Gi memory, with no CPU limit.
- **Probes and port**
  - Port `metrics` (3010) serves `/livez` for both the startup and liveness probes.
  - The startup probe allows 36 failures at a 5s period.
  - The same port serves the Prometheus scrape at `/observability/metrics`.
- **Hardening**
  - Non-root user and group 1000, with `fsGroup` 1000 and the `RuntimeDefault` seccomp profile.
  - Read-only root filesystem, all capabilities dropped, no privilege escalation, and no service account token mounted.
- **Volumes**
  - `tmp`: emptyDir capped at 64Mi.
  - `secrets`: the `app-secrets` Secret at `/run/secrets`, mode 0444, read-only.
  - `data`: the `data` PVC, mounted via subPaths at `/app/public/images`, `/app/tmp/storage` and `/app/tmp/quarantine`.
- **Service `worker-heavy`**: ClusterIP on port 3010, targeting the named `metrics` port. A scraper uses it to reach the worker.

## Relationships
- `k8s/base/worker.yaml`: the sibling Deployment for light and external jobs. It uses the same image and entry point.
- `k8s/base/app.yaml`: the memory sizing refers to the app's ~560 MB steady state, and the `data` PVC and mount paths are the same as `app`'s.
- `k8s/base/kustomization.yaml` and `k8s/overlays/kind/kustomization.yaml`: these include and customize the resource. The file does not say how.
- `k8s/base/networkpolicy.yaml`: the default-deny policy blocks the metrics scraper until an allow rule exists for it.
- `src/infrastructure/runtime/server-lifecycle.ts`: implements the shutdown sequence that `terminationGracePeriodSeconds: 30` is sized around.

## Notes
- **Broker dependency:** without `NODE_RABBITMQ_URL`, which is the rig's default, the app runs jobs in its own process. This pod then boots, consumes nothing and stays healthy. A cluster with a broker must set `NODE_RABBITMQ_URL` and its password file in `app.env`.
- **Shutdown timing:** the sequence is SIGTERM, consumers cancel, a 5s lame-duck delay, then about 3s (20% of the graceful-shutdown timeout) for running jobs to finish and ack, then exit 0. A job still running at that point is redelivered. Keep the grace period above delay plus budget, or SIGKILL can hit a job about to ack and an email is sent twice on every deploy.
- **Memory:** the V8 heap cap (640) sits under the 1Gi container limit because sharp's native buffers live outside the heap. The container limit is the one that holds.
- **CPU:** there is no CPU limit on purpose, because a throttled event loop looks like a hang.
- **Metrics:** `queue_jobs_dead_lettered_total` and `webhook_delivery_attempts_total` move only in the worker. The scrape needs the bearer token from the `metrics_token` secret, the same as the API's.
- **Liveness:** it only checks that the process answers, never a dependency.
- **Scaling:** extra replicas pull from the same queues without coordination.
