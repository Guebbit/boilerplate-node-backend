---
source: tests/cluster/support/redis.ts
sha256: ef1105f64e057618c57a73ace168bb69916abf8b9174524d6e82ba87b292bf6c
generated_at: 2026-11-08T09:18:29.345797+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/redis.ts

## Purpose

Provides a Redis instance for the cluster test suite. It either connects to an already-listening Redis (via `NODE_TEST_REDIS_URL`, as in CI) or starts a throwaway container using the repo's existing container-engine helper, so cluster tests that depend on Redis can run in both local and CI environments without a hard dependency on a specific orchestrator.

## Key elements

- **`TestRedis`** (interface) — the value `startRedis` resolves to: `{ url: string; stop: () => Promise<void> }`.
- **`startRedis()`** (exported function) — entry point. If `NODE_TEST_REDIS_URL` is set, resolves immediately with that URL and a no-op `stop`. Otherwise, requires a container engine on PATH, launches a `redis:7-alpine` container (image overridable via `NODE_TEST_REDIS_IMAGE`), waits for a PING/PONG on the mapped port, then returns the connection URL and a `stop` handle.
- **`waitForPong`** (module-internal) — readiness probe that opens a raw TCP socket to `127.0.0.1:<port>`, sends `PING\r\n`, and resolves on `+PONG`. Retried via `retryUntil` with a 60 s budget and 250 ms interval.
- **`IMAGE`** (constant) — default Docker image, `docker.io/library/redis:7-alpine`; read from `NODE_TEST_REDIS_IMAGE` if set.

## Relationships

- **`tests/support/container-engine.ts`** — source of `containerEngine`, `containerEngineAvailable`, and `startContainer`. This file delegates all container lifecycle to that module rather than using a dedicated testcontainers library.
- **`tests/support/eventually.ts`** — provides `retryUntil`, the polling primitive used by `waitForPong`.
- **`tests/cluster/rate-limit.test.ts` / `tests/cluster/redis-idle.test.ts`** — the cluster tests that call `startRedis` to obtain their Redis target and call `stop` in teardown.
- **`docker-compose.test.yml`** — in CI, the service container defined here is the Redis that `NODE_TEST_REDIS_URL` points to; this file's container path is the local-dev fallback.

## Notes

- **No Redis client library is imported.** Readiness is checked with a raw `net` socket writing the RESP `PING` command. This keeps the test-support layer dependency-free.
- **`stop()` is a no-op when the URL came from `NODE_TEST_REDIS_URL`.** Tests that call `stop` in `afterEach` must not assume they own the process.
- **Containers are started with `--rm` and a per-run name prefix** (`node-backend-cluster-redis`), so a Ctrl-C mid-test leaves no residual container for the next run to collide with.
- **CI constraint:** inside a container you cannot start another container, so `NODE_TEST_REDIS_URL` is the only path that works there. The error message explicitly calls this out if no engine is found.
