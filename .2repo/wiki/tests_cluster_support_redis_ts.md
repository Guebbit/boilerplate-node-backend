# tests/cluster/support/redis.ts

## Purpose

Provides a disposable Redis instance for the cluster test suite. It either reuses a URL supplied via `NODE_TEST_REDIS_URL` (the CI path) or spins up a short-lived container using the repo's named engine (podman by default). The file deliberately avoids the testcontainers library to keep the podman-first contract with no extra dependency or socket workaround.

## Key elements

- **`TestRedis`** (exported interface) — `{ url: string; stop: () => Promise<void> }`, the handle the suite works with.
- **`startRedis()`** (exported) — Main entry point. Returns a `TestRedis`. If `NODE_TEST_REDIS_URL` is set it resolves immediately with a no-op `stop`; otherwise it allocates a free port, runs `podman run -d --rm` with a UUID-suffixed name, waits for a `+PONG` reply, and wires `stop` to `engine rm -f <name>`.
- **`containerEngineAvailable()`** (exported) — Synchronous boolean; shells out to `ENGINE info` and reports whether the binary is reachable.
- **`freePort()`** (internal) — Binds a `net.Server` on port 0, reads the assigned port, closes it.
- **`waitForPong()`** (internal) — Polls a raw TCP `PING\r\n` against `127.0.0.1:<port>` every 250 ms until `+PONG` arrives or a 60 s deadline is hit.

## Relationships

- **`tests/cluster/rate-limit.test.ts`** — Consumes `startRedis()` (and `containerEngineAvailable()`) to obtain the Redis backing the rate-limit windows under test; calls `stop()` in teardown.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — Same pattern: grabs a `TestRedis` for the search-parity assertions and releases it after the suite finishes.

## Notes

- **Engine resolution** — `CONTAINER_ENGINE` env var overrides the default `'podman'`; the image is controlled by `NODE_TEST_REDIS_IMAGE` (default `docker.io/library/redis:7-alpine`).
- **No Redis client dependency** — Readiness is checked with a raw TCP `PING`/`PONG` rather than importing `ioredis`/`node-redis`, keeping this file's dependency surface to `node:child_process`, `node:net`, and `node:crypto`.
- **CI short-circuit** — When `NODE_TEST_REDIS_URL` is set, `startRedis()` returns synchronously (wrapped in `Promise.resolve`) and `stop()` is a no-op; the suite must not assume it owns the instance.
- **Container naming** — `node-backend-cluster-redis-<8-hex>` with `--rm` ensures a crashed run leaves no container behind, but a truly orphaned container (e.g. engine crash before `--rm` kicks in) is *not* cleaned up by this file.
- **Typed callback quirk** — The `execFile` callback is typed as `(error: Error | null) => …` rather than letting TS narrow; the comment in source explains this is intentional because Node already hands back `Error | null`.
