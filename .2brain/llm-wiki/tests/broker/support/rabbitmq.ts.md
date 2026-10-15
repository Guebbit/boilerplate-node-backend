---
source: tests/broker/support/rabbitmq.ts
sha256: 4a833b8fb0684e2a74fa62324a147389f92265d0651aabad5a2ed93a7e7685c3
generated_at: 2026-10-15T12:30:51.679927+00:00
model: ollama:qwen3.8:27b
---

# tests/broker/support/rabbitmq.ts

## Purpose

Provides a ready-to-use RabbitMQ broker for the queue-broker test suite, scoped to a throwaway vhost so each run is isolated from prior topology. It either connects to a pre-existing broker (via `NODE_TEST_RABBITMQ_URL`) or spins one up in a container, then hands back an AMQP URL, a typed management-API handle, and a cleanup function.

## Key elements

- **`startRabbitMq()`** — Main entry point. Resolves the AMQP/management URLs, waits for broker readiness, creates a unique vhost with full permissions for the `guest` user, and returns a `TestRabbitMq`. Rejects (does not skip) when no broker and no container engine are available.
- **`TestRabbitMq`** — Interface bundling `url` (vhost-scoped AMQP), `vhost` (name), `management` (`ManagementApi`), and `stop()` (deletes vhost, then stops the container if one was started).
- **`ManagementApi`** — `queue(name)` returns the declared definition (`type`, `durable`, `arguments`, message counters); `dropConnections()` closes all open connections from the broker side and returns the count.
- **`ManagedQueue`** — Typed subset of the management API's queue-definition JSON.
- **`waitForBroker(url, timeoutMs)`** — Repeatedly attempts an AMQP connect/close until the broker accepts or the 90 s deadline expires.
- **`listConnections` / `closeAll`** — Poll `/vhosts/{vhost}/connections` (the broker's stats interval is ~5 s, so a just-opened connection may not appear yet), then `DELETE` each by name.
- **`createVhost(base, vhost)`** — `PUT` the vhost, then `PUT` wildcard permissions for the user.
- **`call(base, path, init)`** — Low-level `fetch` wrapper that injects a Basic-auth header (because `fetch` rejects credentials embedded in a URL).
- **`jsonOrThrow(response)`** — Parses JSON or rejects with the HTTP status.

## Relationships

- **`tests/container-engine.ts`** — Imported for `containerEngineAvailable()`, `startContainer()`, and the `containerEngine` display name; used when no pre-existing broker URL is supplied.
- **`tests/broker/queue-broker.test.ts`** — Primary consumer; calls `startRabbitMq()` to obtain the broker and `management` handle for assertions, and calls `stop()` in teardown.

## Notes

- The test image is `rabbitmq:4-management`, not the production `rabbitmq:4-alpine`, because the suite needs the management HTTP plugin (queue-definition reads, connection drops) that the alpine image does not ship.
- `fetch` cannot carry userinfo in the URL, so every management call re-encodes credentials as a `Basic` auth header.
- `dropConnections` polls for up to 20 s because RabbitMQ's connection stats refresh on a ~5 s interval; a connection opened milliseconds earlier is invisible until the next stats tick.
- The suite **refuses to skip**: if neither a URL nor a container engine is available, it throws with an actionable message rather than letting the test pass silently.
- `stop()` swallows the vhost-delete error (`.catch(() => undefined)`) so a partial failure in cleanup does not mask the test result, then proceeds to stop the container.
