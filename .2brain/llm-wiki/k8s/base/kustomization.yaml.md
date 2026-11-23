---
source: k8s/base/kustomization.yaml
source_sha256: 086f1c84206a35f94bc11db751c2276a8715e5fa121bedd7c0094ec848f5e44f
context_sha256: 6e544a397be6a7549bc2473a35d8bb65551bb55d536308dec4c713f347b067ba
generated_at: 2026-11-22T01:37:13.541114+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/base/kustomization.yaml

## Purpose
Kustomize entrypoint for the app's base Kubernetes manifests. `kubectl apply -k k8s/base` deploys the app as plain objects on any cluster, with no Gateway API, ingress controller or CRD. Public traffic is left to a component (`k8s/components/gateway/`) or the deployer's own Ingress. The local test cluster is `k8s/overlays/kind/`.

## Key elements
- `namespace: boilerplate`: sets the namespace for every resource.
- `resources`: lists `namespace.yaml`, `networkpolicy.yaml`, `mongo.yaml`, `cache.yaml`, `setup.yaml`, `app.yaml`, `cron.yaml`, `worker.yaml` and `worker-heavy.yaml`.
- `configMapGenerator`:
  - `app-env` is generated from `app.env` (env-file format).
  - `crontab` is generated from the `crontab` file.
  - Both get a content-hash suffix in their name, so an edit changes the pod template and rolls the Deployment.
- `images`: rewrites `boilerplate-app` to `localhost/boilerplate-app:rig`, the image every app-code workload runs.

## Relationships
- Includes all nine resource files listed above. `mongo-init` is mentioned in the ordering comment but is not a separate resource file here.
- `k8s/rig.sh` builds and loads the `localhost/boilerplate-app:rig` image into the kind node. It also applies the base in two halves using the `boilerplate/stage` label (see Notes).
- `k8s/overlays/kind/kustomization.yaml` is the local kind-cluster overlay built on this base.

## Notes
- **Prerequisites the deployer must create:** the Secret `app-secrets` (one key per file the app reads from `/run/secrets`, see `secrets.example.txt`) and the ConfigMap `edge-env` (`NODE_URL`, `NODE_FRONTEND_URL`, `NODE_CORS_ORIGIN`). The repo cannot hold either.
- **Apply order matters:**
  - First apply `mongo`, `mongo-init`, `cache` and `setup`, and wait for `setup` to complete.
  - Then apply `app`, `worker`, `worker-heavy` and `cron`.
  - This mirrors Compose's `depends_on: service_completed_successfully`.
  - Objects carry the label `boilerplate/stage: app`. Use `-l boilerplate/stage!=app` for the first half and `-l boilerplate/stage=app` for the second.
  - Applying everything at once boots `app` against a database with no indexes and no shop row.
- **Image override:** a real cluster should set its own image, for example with `kustomize edit set image`. The `localhost/...:rig` value is specific to the local rig.
