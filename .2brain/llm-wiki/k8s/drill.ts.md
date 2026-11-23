---
source: k8s/drill.ts
source_sha256: 232edeeea6ce0e3247a81cd04d2ef34882baf7fc685ed851c9c6e69b65f4d0eb
context_sha256: b94c79395b9b8f699a7b19ed9dac392fc239e59a3e635aba78543f5848da65ce
generated_at: 2026-11-22T01:39:08.233321+00:00
model: claude-code:claude-sonnet-5-5
---

# k8s/drill.ts

## Purpose
A command-line script (run via `k8s/rig.sh drill` against the kind cluster that `rig.sh up` created) that performs a rolling restart of the `app` deployment under steady traffic, then checks a live notification stream across pods. It exits 1 when any check fails.

## Key elements
- **Configuration constants**: `KUBECONFIG`, `CONTEXT`, `NAMESPACE` (default `boilerplate`) and the edge URL `EDGE` (port from `RIG_PORT`, default 3072) come from environment variables. `GRACE_MS` (30 s) mirrors `terminationGracePeriodSeconds` in `k8s/base/app.yaml`. Other tunables are `LOADERS` (4), `LOADER_PAUSE_MS`, `MIN_DRAIN_GAP_MS` (1000 ms) and `ENDPOINT_SAMPLE_MS` (250 ms).
- **`say`**: writes a line to stdout.
- **`Check` / `PodRecord` / `Traffic`**: types for one verdict (`name`, `ok`, `detail`), for what is observed about an old pod (exit code and time, when it dropped out of the ready endpoints, its log), and for the traffic result (`statuses`, `errors`, `stop`).
- **`kubectl`**: runs `kubectl` with `--kubeconfig`, `--context` and `-n` always set, and resolves with stdout. It rejects with stderr on failure.
- **`kubectlStream`**: spawns a long-running kubectl and passes each complete stdout line to a callback. It returns the child process.
- **`readyPods`**: names of Running and Ready app pods, oldest first.
- **`readyEndpoints`**: pod names that are ready in the `app` Service's EndpointSlices.
- **`portForward`**: forwards a random local port to a pod's port 3000 and resolves with the base URL and the child process. This lets a request reach one specific pod.
- **`startTraffic`**: runs 4 loops that call `GET /` through the edge until stopped. It records statuses and network errors.
- **`watchOldPods`**: fills a `Map<string, PodRecord>` from three sources: `logs -f` per old pod, a `get pods --watch` for container exit codes, and a periodic endpoint sampler. It returns the child processes and a `stopSampling` function.
- **`checkOldPods`**: produces three `Check`s: every old pod exits 0, no log contains "Graceful shutdown timeout", and each pod leaves the ready endpoints at least `MIN_DRAIN_GAP_MS` before it exits.
- **`writeUntilHeard`**: marks the account's inbox read through one pod until a stream held on another pod receives the frame. Its definition is only partly visible.

## Relationships
- `tests/replicas/support/client.ts`: supplies `call`, `jsonHeaders` and `signUpAndLogIn`. These are used for the traffic loaders and for account and auth setup.
- `tests/replicas/support/event-stream.ts`: supplies `openNotificationStream`, the stream reader used for the cross-pod live-stream checks.
- `tests/support/eventually.ts`: supplies `retryUntil`, imported through the `@tests/eventually` alias.
- `src/infrastructure/adapters/logger.ts`: no direct interaction is visible in the shown portion of the file.

## Notes
- Every kubectl call names the context explicitly, so the drill cannot touch another cluster.
- The header lists further checks beyond those in `checkOldPods`. These are no request failing during the restart, the drain `retry:` on a stream held on an old pod, a cross-pod frame on a new pod, and NetworkPolicy reachability (`k8s/base/networkpolicy.yaml`).
- The drain-gap check treats missing timestamps as failures, because the `NaN` comparison is false.
- The exit-code watch relies on kubectl's jsonpath output being whitespace-separated. It records the exit only when a code is present.
