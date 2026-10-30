---
source: tests/cluster/support/redis.ts
sha256: ef1105f64e057618c57a73ace168bb69916abf8b9174524d6e82ba87b292bf6c
generated_at: 2026-10-29T06:38:17.849692+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/redis.ts

## Purpose

Provides the cluster test suite with a disposable Redis instance. It either points at a Redis already supplied by the environment (CI service container) or spins one up via the repo's own container-engine abstraction, then waits for readiness before handing back a connection URL and a `stop` handle.

## Key elements

- **`TestRedis`** — interface: `{ url: string; stop: () => Promise<void> }`. The contract every consumer of this module expects.
- **`startRedis()`** *(exported)* — Resolves a `TestRedis`. If `NODE_TEST_REDIS_URL` is set, it returns immediately with a no-op `stop`. Otherwise it calls `startContainer` with the Redis image, waits for PING/PONG, and returns the mapped URL plus the engine's stop function.
- **`waitForPong(port, timeoutMs)`** *(internal)* — Raw TCP `PING\r\n` → `+PONG` readiness probe using `node:net`, wrapped in `retryUntil` (250 ms interval). No Redis client library required.
- **`IMAGE`** — Defaults to `docker.io/library/redis:7-alpine`; overridable via `NODE_TEST_REDIS_IMAGE`.

## Relationships

- **`tests/support/container-engine.ts`** — Imports `containerEngine`, `containerEngineAvailable`, and `startContainer`. All container lifecycle (image pull, port mapping, `--rm` naming, teardown) is delegated here; this file never shells out directly.
- **`tests/support/eventually.ts`** — Imports `retryUntil` to poll the PING/PONG probe within a 60 s budget.
- **`tests/cluster/rate-limit.test.ts`**, **`tests/cluster/redis-idle.test.ts`** — Cluster tests that consume `startRedis()` to obtain their Redis target and call `stop` in teardown.
- **`scripts/testing/run-prism-smoke-test.ts`** — Smoke-test script in the same cluster-test graph; likely invokes `startRedis` for its Redis dependency.

## Notes

- Readiness is checked with a raw TCP socket, not a Redis client—intentionally avoids pulling in a driver dependency just to confirm the port is listening.
- The container is started with `--rm` and a run-specific name prefix (`node-backend-cluster-redis-*`), so an interrupted test run leaves no stale container behind.
- When `NODE_TEST_REDIS_URL` is set, `stop()` is a no-op; the suite must not attempt to tear down an externally managed service.
- The error message when no container engine is found is deliberately verbose: it tells the developer to either set `NODE_TEST_REDIS_URL` (the in-container path) or ensure `podman`/`docker` is on `PATH`.
