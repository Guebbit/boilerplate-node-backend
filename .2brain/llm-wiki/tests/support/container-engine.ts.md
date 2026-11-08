---
source: tests/support/container-engine.ts
sha256: 26f971e95618b209ea5a3ec7b963cc1c5ce502917a960dc31ffd0c4bdc0d7754
generated_at: 2026-11-08T09:52:43.496555+00:00
model: ollama:qwen3.8:27b
---

# tests/support/container-engine.ts

## Purpose

Thin wrapper around the repo's container engine (podman by default) for starting and tearing down throwaway containers inside test suites. Exists because the repo is podman-first (`CONTAINER_ENGINE` env, defaulting to `podman`) and using testcontainers would force a Docker-socket workaround on every dev machine and CI runner.

## Key elements

- **`containerEngine`** – `const` string; the binary to invoke (`process.env.CONTAINER_ENGINE ?? 'podman'`).
- **`ContainerSpec`** – input interface: `image`, `namePrefix`, `ports` (container-side), optional `env`.
- **`RunningContainer`** – output interface: `hostPorts` (in the same order as `spec.ports`) and a `stop()` that never rejects.
- **`freePort()`** – returns a promise for a free TCP port by binding to port 0 and reading back the OS-assigned value.
- **`containerEngineAvailable()`** – synchronous check that the engine binary is on PATH and responds to `info`.
- **`startContainer(spec)`** – runs `<engine> run -d --rm --name <prefix>-<uuid8> -p h:c … image`; resolves with the mapped host ports and a `stop` closure that issues `rm -f`.

## Relationships

- **`tests/cluster/support/redis.ts`** – consumes `startContainer` / `ContainerSpec` to launch a Redis container for the cluster test suite.
- **`tests/broker/support/rabbitmq.ts`** – same pattern for a RabbitMQ container in the broker suite.
- **`tests/cluster/rate-limit.test.ts`** – transitively benefits; the rate-limit tests depend on the Redis instance that `redis.ts` starts via this module.

## Notes

- `stop()` is intentionally catch-all (swallows errors) so it is safe to call unconditionally in `afterAll`.
- `--rm` is passed to the engine so a crashed or interrupted run leaves no dangling container for the next invocation to collide with.
- Port allocation binds to `0` rather than picking a number, avoiding races between parallel test workers.
- The engine binary name is read once at module-load time; changing `CONTAINER_ENGINE` at runtime (e.g. via a helper) will not take effect.
