---
source: k8s/base/worker.yaml
source_sha256: fb506a51cdf0d6194e8844c8f36c7bb7c2009a3c30482f3a57203e98918b63fb
context_sha256: bad242e692308d1aa4588e3ebaa1cae9c741850977f84693397b571199e75451
generated_at: 2026-11-22T01:38:25.927365+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/worker.yaml

## Purpose
Kustomize base manifest for the `worker` queue consumers: a Deployment plus a ClusterIP Service. It runs the same image as `app` (`boilerplate-app`) with a different entry point (`src/worker.ts`) to process jobs that `app` publishes (emails, image digests, webhook deliveries). It mirrors Compose's `worker` service.

## Key elements
- **Deployment `worker`**
  - 1 replica by default, scaled manually with `kubectl scale`.
  - Rolling update with `maxSurge: 1` and `maxUnavailable: 0`, so the queue is never left unattended.
  - Container args are `node --import tsx src/worker.ts`.
  - Env comes from the `app-env` and `edge-env` ConfigMaps, plus `NODE_SERVICE_NAME=api-worker`.
  - Resources: requests of 50m CPU and 640Mi memory; memory limit 1Gi; no CPU limit.
  - Hardening: pod-level `runAsNonRoot` with uid/gid 1000, `RuntimeDefault` seccomp, and `automountServiceAccountToken: false`. Container-level read-only root filesystem, no privilege escalation, all capabilities dropped.
  - Port `metrics` (3010). `startupProbe` and `livenessProbe` both hit `GET /livez`.
  - Volumes:
    - `tmp`: emptyDir, 64Mi.
    - `secrets`: Secret `app-secrets`, mounted read-only at `/run/secrets`.
    - `data`: PVC `data`, mounted with subPaths at `/app/public/images`, `/app/tmp/storage` and `/app/tmp/quarantine`.
- **Service `worker`**: ClusterIP on port 3010 (targetPort `metrics`), so a scraper can reach the worker's Prometheus endpoint at `/observability/metrics`.

## Relationships
- `k8s/base/app.yaml`: same image, same `app-env`/`app-secrets`/`data` claim and paths. The worker's memory sizing refers to app.yaml's ~560 MB steady footprint.
- `k8s/base/kustomization.yaml`: presumably lists this file as a resource. `k8s/overlays/kind/kustomization.yaml` builds on the base.
- `k8s/base/networkpolicy.yaml`: the default-deny policy blocks the metrics scraper until it gets its own allow rule (see `docs/operate/deployment-hardening.md#on-kubernetes`).
- `src/infrastructure/runtime/server-lifecycle.ts`: implements the shutdown sequence that `terminationGracePeriodSeconds` is sized for.
- `docs/operate/health-checks.md`: the policy that liveness means "the process answers", never a dependency check.
- `k8s/base/worker-heavy.yaml`: sibling worker manifest. This file does not say how it differs.

## Notes
- **Broker:** without `NODE_RABBITMQ_URL` (the default in `app.env`), the app runs jobs in its own process. The worker pod then boots, consumes nothing and stays healthy. A cluster with a broker sets `NODE_RABBITMQ_URL` and its password file in `app.env`.
- **Shutdown timing:** on SIGTERM, consumers cancel at once. After the lame-duck delay (`NODE_SHUTDOWN_DELAY_MS`, 5 s), running jobs get about 3 s (20% of `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`) to ack. A job still running then is redelivered. The 30 s grace period must stay above delay plus budget, or a SIGKILL can cause duplicate sends such as double emails on each deploy.
- **`args`, not `command`:** `command` would replace the image ENTRYPOINT (dumb-init as PID 1), and SIGTERM would stop reaching Node.
- **No CPU limit:** a throttled event loop looks like a hang. The heap cap comes from `NODE_OPTIONS` in `app.env`.
- **Metrics scrape:** the `queue_jobs_dead_lettered_total` and `webhook_delivery_attempts_total` counters move only in the worker, so the scrape must target it. It needs bearer auth with the `metrics_token` secret, the same as the API.
- **Probes:** the startup probe allows up to 36 × 5 s of boot time. There is no readiness probe.
