---
source: k8s/base/cache.yaml
source_sha256: 64c8a04ab1dbf683d65d242b2049dc01dd78717bff25882cd0f5f2ffd4dcb655
context_sha256: ea737c9e547d424b3aa747c1a6a71f9cde7f6775ffda33fd268e07c9d246b335
generated_at: 2026-11-22T01:36:48.924823+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/cache.yaml

## Purpose
Defines the in-cluster Redis used for the cache, rate-limit counters, and idempotency/session claims. It is a single, non-persistent instance: a `Deployment` plus a `ClusterIP` `Service`, both named `cache`.

## Key elements
- **Deployment `cache`**: 1 replica with `Recreate` strategy. It runs `redis:8-alpine`, pinned by digest, in a container named `redis`.
- **Redis args**: `--maxmemory-policy noeviction --save '' --appendonly no`. Nothing is evicted and nothing persists to disk.
- **Pod security**: `runAsNonRoot` as uid/gid 999 (the image's `redis` user), `RuntimeDefault` seccomp, no service account token mounted. The container has a read-only root filesystem, no privilege escalation, and all capabilities dropped.
- **Resources**: requests 50m CPU and 64Mi memory; memory limit 256Mi, no CPU limit.
- **Readiness probe**: `redis-cli ping` every 5s.
- **Volume `data`**: an `emptyDir` mounted at `/data`. It is the only writable path given the read-only root filesystem.
- **Service `cache`**: `ClusterIP` on port 6379, selecting the `cache` name label and targeting the named port `redis`.

## Relationships
- `compose.production.yaml`: the header comment says it runs a second Redis instance, also with `noeviction`, for the same reason.
- `k8s/base/kustomization.yaml`: the base kustomization is the natural place this manifest is included. This is inferred, since the file doesn't show it.
- `k8s/base/app.yaml` and `k8s/base/networkpolicy.yaml`: the `Service` name `cache` and its pod labels are what the app and network policy rules would reference. The file itself doesn't show those references.

## Notes
- `noeviction` is deliberate. Evicting a counter or a single-use claim would break its guarantee. The cost is that Redis returns write errors once `maxmemory` is reached.
- The file sets no `--maxmemory`. The 256Mi container limit is the only memory bound visible here.
- A restart empties all data, and the app is stated to tolerate this.
- `Recreate` with one replica means a brief outage on every rollout, and the cache is never run in parallel.
