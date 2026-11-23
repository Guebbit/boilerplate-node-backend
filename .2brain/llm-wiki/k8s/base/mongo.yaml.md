---
source: k8s/base/mongo.yaml
source_sha256: f8bda4cd2fa856829da59d565f3706b616e1565c7897358b75d720a9a89cc8cb
context_sha256: ee6163ff8b060259d200e7cf8052eae16278aaf2526d9cc4b231cbe1f16256e4
generated_at: 2026-11-22T01:37:26.910608+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/mongo.yaml

## Purpose
Defines the MongoDB deployment for the Kubernetes base: a single-node MongoDB run as a one-member replica set (`rs0`). The app uses transactions, which require a replica set even with one node. The rig has no TLS and no auth (one namespace, one node, nothing published). A real deployment brings its own managed Mongo and sets `NODE_DB_URI`.

## Key elements
- **StatefulSet `mongo`**: 1 replica running `mongod --replSet rs0 --bind_ip_all`. The image is the official `mongo:9.0.4`, pinned by digest. It exposes port 27017 (named `mongo`) and requests 100m CPU and 256Mi memory, with a 1Gi memory limit. The readiness probe runs `mongosh` with `db.adminCommand('ping')` every 5s. A `data` volumeClaimTemplate (2Gi, ReadWriteOnce) is mounted at `/data/db`.
- **Service `mongo`**: headless (`clusterIP: None`) with `publishNotReadyAddresses: true`, so `mongo-0.mongo` resolves to the pod even before it is Ready.
- **Job `mongo-init`**: `backoffLimit: 6`, `restartPolicy: OnFailure`. It waits for ping on `mongo-0.mongo`, then runs `rs.status()`. If that throws (set not initiated), it calls `rs.initiate` with `_id: 'rs0'` and a single member at `mongo-0.mongo:27017`. It finally waits until `rs.isMaster().ismaster` is true.

## Relationships
The graph neighbors (`app.yaml`, `kustomization.yaml`, `networkpolicy.yaml`, `setup.yaml`) are not referenced in this file's content. The only hint of a consumer is the comment saying a deployment that brings its own managed Mongo sets `NODE_DB_URI`.

## Notes
- The readiness probe only checks `ping`, which succeeds before a primary exists. Waiting for a primary is the init Job's responsibility, so pod Ready does not mean the replica set is usable.
- The replica set member host is the StatefulSet DNS name (`mongo-0.mongo:27017`), not `localhost`. This lets drivers in other pods reach it.
- The init Job is idempotent: it uses `rs.status()` throwing as the signal to initiate.
- Pod-level hardening stops at the `RuntimeDefault` seccomp profile and `automountServiceAccountToken: false`. The official image starts as root, chowns its data directory, then drops to `mongodb`, so it can't run with a read-only root or fully dropped capabilities.
- The image digest is duplicated in the StatefulSet and the Job. Update both together.
