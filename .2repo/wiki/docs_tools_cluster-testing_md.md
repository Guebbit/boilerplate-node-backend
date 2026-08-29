# docs/tools/cluster-testing.md

## Purpose

Documents the `npm run test:cluster` suite — the only test run that boots `src/cluster.ts` and forks real worker processes. It exists to catch a class of bug invisible to single-process tests: state that is correct within one worker but absent across the cluster (per-process counters, in-process caches). The primary target is the rate limiter, where a per-process budget silently multiplies by worker count.

## Key elements

- **Two-case assertion design** — (1) Redis store: budget spent exactly `LIMIT` times across all workers; (2) in-memory store: budget spent exactly `LIMIT × WORKERS` times. The second case is the control that proves two separate processes are actually counting independently.
- **Three critical runtime settings** — `NODE_ENABLE_CLUSTERING=1` (forks are gated on this flag), `NODE_ENV=development` (avoids `app.ts` skipping `startServer()`), and `agent: false` + `Connection: close` (prevents socket reuse from funneling all traffic to one worker).
- **Redis provisioning** — Uses `NODE_TEST_REDIS_URL` if set; otherwise starts a container via `podman`/`docker` and tears it down. Fails (not skips) when neither is available.
- **Per-run key prefix** — Rate-limit counters are namespaced per run to avoid cross-run contamination within the one-minute sliding window.
- **Bug-found log** — Records a double-`connect()` race in `RedisStore.init()` that silently disabled all rate limiting.

## Relationships

- **`src/cluster.ts`** — The module under test. Gates the `fork()` call behind the `NODE_ENABLE_CLUSTERING` env flag; without it, no workers are spawned and all cross-worker assertions pass vacuously.
- **`src/app.ts`** — The Express app each worker mounts. Skips its own `startServer()` when `NODE_ENV=test`, which is why the suite must use `NODE_ENV=development`.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — The rate limiter implementation under test. Contains the `connecting`-promise fix that serialises `connect()` calls on a shared Redis client.
- **`docs/tools/concurrency-testing.md`** — The in-process race suite. Explicitly contrasted: that suite's contention lives inside Mongo and doesn't require multiple OS processes, whereas this suite's assertions do.

## Notes

- The in-memory (control) case is load-bearing: without it, a broken harness where only one worker ever serves would still pass the "shared budget" case.
- The suite lives in `complete:manual`, not `complete`, because it needs a container engine and takes ~25 s. CI runs it on every push where a Redis service container is already available.
- No `testcontainers` dependency: the repo is podman-first, and the container lifecycle is handled with ~30 lines of direct engine invocation.
- The suite intentionally **fails** (red) rather than skipping when Redis is unavailable — a green skip on a security-control test is indistinguishable from a green pass.
