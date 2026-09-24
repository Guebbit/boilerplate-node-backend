---
source: tests/cluster/support/redis.ts
sha256: 9b3b9d27f7ba82672c3ae5d3b38b3cf414c90a972e98be2698772e8a2197d776
generated_at: 2026-09-23T19:51:27.747844+00:00
model: ollama:qwen3.8:27b
---

# tests/cluster/support/redis.ts

## Purpose

Test-only helper that provisions a disposable Redis instance for the cluster test suite. It starts a Redis container via the repo's podman-first container engine (or picks up an externally provided URL) and returns a handle with a `stop()` teardown, eliminating the need for testcontainers in a podman-native environment.

## Key elements

- **`TestRedis` (interface)** — The handle returned to callers: `{ url: string; stop: () => Promise<void> }`.
- **`containerEngineAvailable()`** — Synchronous check that the engine (default `podman`, overridable via `CONTAINER_ENGINE`) is on `PATH` and responds to `info`.
- **`startRedis()`** — Main entry point. Returns `Promise<TestRedis>`.
    - If `NODE_TEST_REDIS_URL` is set, resolves immediately with that URL and a no-op `stop` (CI path).
    - Otherwise: grabs a free port, launches `redis:7-alpine` (or `NODE_TEST_REDIS_IMAGE`) with `--rm --name <uuid>`, polls `PING`/`PONG` over raw TCP until it answers (60 s timeout), then resolves.
    - `stop()` runs `<engine> rm -f <name>` to tear the container down.
- **`freePort()`** (internal) — Binds a `net.Server` to port 0 to obtain an OS-assigned free port.
- **`waitForPong()`** (internal) — Raw-socket Redis `PING` loop with 250 ms retry interval and a hard deadline.

## Relationships

- **`tests/cluster/rate-limit.test.ts`** — Calls `startRedis()` in its `before`/`after` hooks to get a real Redis backing the rate-limit logic under test.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — Uses the same helper to spin up a Redis instance for search-parity contract assertions that require a live key-value store.

## Notes

- **No testcontainers by design.** The repo is podman-first (`.env-example` sets `CONTAINER_ENGINE` to `podman`); this file avoids the Docker-socket indirection that testcontainers would require.
- **Inside a container there is no engine.** If `containerEngineAvailable()` returns false the error message explicitly tells the reader to set `NODE_TEST_REDIS_URL` instead — the only viable path in nested-container CI.
- **Port is ephemeral, not fixed.** Each run gets a random free port; the container name includes a UUID prefix so concurrent runs never collide. `--rm` means a crashed run leaves no residue.
- **`stop()` is fire-and-forget style** — it resolves as soon as `execFile` completes, without awaiting the container's actual shutdown. Callers should not assume the port is released the instant `stop()` resolves.
