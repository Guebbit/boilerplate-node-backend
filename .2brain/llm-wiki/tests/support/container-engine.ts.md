---
source: tests/support/container-engine.ts
sha256: 26f971e95618b209ea5a3ec7b963cc1c5ce502917a960dc31ffd0c4bdc0d7754
generated_at: 2026-10-15T12:56:28.085272+00:00
model: ollama:qwen3.8:27b
---

# tests/support/container-engine.ts

## Purpose

Provides a minimal "start one throwaway container" helper for integration tests that need a real external service (Redis, RabbitMQ) which in-process fakes cannot adequately cover. It drives the repo's configured container engine (podman by default) directly via its CLI rather than using testcontainers, because this repo is podman-first and testcontainers would require exporting a podman socket as `DOCKER_HOST` everywhere.

## Key elements

- **`containerEngine`** (const) — Resolved once at module load from `process.env.CONTAINER_ENGINE`, defaulting to `'podman'`. Used as the binary for every engine call.
- **`ContainerSpec`** (interface) — Input to `startContainer`: image reference, `namePrefix`, list of container-side TCP ports to publish, optional env vars.
- **`RunningContainer`** (interface) — Returned by `startContainer`: `hostPorts` (the actual host ports, in order) and `stop()` (removes the container; never rejects, safe to call in `afterAll`).
- **`freePort()`** — Binds a TCP server to port `0`, reads back the OS-assigned port, closes the server. Avoids fixed-port collisions between concurrent test runs.
- **`containerEngineAvailable()`** — Runs `<engine> info` with `stdio: 'ignore'`; returns `true` if the binary exists on PATH and responds.
- **`startContainer(spec)`** — Assembles and execs `<engine> run -d --rm --name <prefix>-<uuid8> -p … -e … <image>`. Returns a `RunningContainer` whose `stop` issues `<engine> rm -f <name>`.

## Relationships

- **`tests/cluster/support/redis.ts`** and **`tests/cluster/rate-limit.test.ts`** — Consumers that use `startContainer` to spin up a Redis container for cluster-level tests.
- **`tests/broker/support/rabbitmq.ts`** — Consumer that uses `startContainer` to spin up a RabbitMQ container for broker tests.

## Notes

- `stop()` is intentionally infallible (never rejects) so it can be called unconditionally in `afterAll` teardown without masking the original test failure.
- The `--rm` flag plus a random 8-char UUID suffix on the container name means an interrupted run leaves no stale container for the next run to collide with.
- `containerEngine` is read once at import time; changing `CONTAINER_ENGINE` after the module is loaded has no effect.
- The file deliberately avoids any Docker-socket dependency; the only node builtins used are `child_process`, `crypto`, and `net`.
