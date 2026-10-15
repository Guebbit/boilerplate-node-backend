---
source: tests/cluster/support/redis.ts
sha256: b6278940719b5c01008315494aa7eae8b869e1d47688d9e61d433283eda8cb14
generated_at: 2026-10-15T12:31:46.331075+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/redis.ts

## Purpose

Provides the cluster test suite with a disposable Redis instance. It either points at an already-running Redis (via env var) or spins one up through the repo's existing container engine, so tests that need a real Redis socket don't have to manage lifecycle themselves.

## Key elements

- **`startRedis()`** — Main export. Returns `Promise<TestRedis>`. If `NODE_TEST_REDIS_URL` is set, returns it immediately (no-op `stop`). Otherwise starts a container and waits for PING/PONG before resolving.
- **`TestRedis`** — Interface: `{ url: string; stop: () => Promise<void> }`.
- **`waitForPong(port, timeoutMs)`** — Internal. Raw TCP connection, sends `PING\r\n`, retries every 250 ms until the deadline (default caller: 60 s).
- **`IMAGE`** — Defaults to `docker.io/library/redis:7-alpine`; overridable via `NODE_TEST_REDIS_IMAGE`.
- **Container name prefix** — `node-backend-cluster-redis`; container is started with `--rm` so an interrupted run leaves no residue.

## Relationships

- **Imports** `containerEngine`, `containerEngineAvailable`, `startContainer` from `tests/support/container-engine.ts` — the sole container-lifecycle dependency.
- **Consumed by** `tests/cluster/rate-limit.test.ts` and `tests/cluster/redis-idle.test.ts`, which call `startRedis()` to get a Redis URL for their suites.

## Notes

- `NODE_TEST_REDIS_URL` takes priority over any container start. In that path `stop()` is a resolved no-op — the caller owns the external instance's lifecycle.
- Health check uses a bare `net.connect` socket, not a Redis client library, so the file has zero runtime dependencies beyond Node stdlib and the container-engine module.
- The error message for a missing container engine references `CONTAINER_ENGINE` (default `podman`), set on the container-engine side.
- The PONG check expects the reply to start with `+PONG`; any other response (including an auth-required `-NOAUTH`) is treated as a failure and will exhaust the 60 s deadline.
