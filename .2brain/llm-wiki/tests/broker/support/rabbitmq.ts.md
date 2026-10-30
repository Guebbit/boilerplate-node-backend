---
source: tests/broker/support/rabbitmq.ts
sha256: 520b36655ee3761733815f3636a0135ca3e3bf1341f036e50efb9bf26a368c71
generated_at: 2026-10-29T06:37:48.745574+00:00
model: ollama:qwen3.8:27b
---

# tests/broker/support/rabbitmq.ts

## Purpose

Test-support module that provisions a RabbitMQ broker (either an externally-supplied instance or a locally-spawned container) scoped to a unique virtual host per run. It exposes an AMQP URL, a narrow management-API client, and a teardown handle so the broker test suite can exercise the queue adapter against a real broker without polluting state between runs.

## Key elements

- **`startRabbitMq()`** — Main entry point. Resolves the broker from `NODE_TEST_RABBITMQ_URL` / `NODE_TEST_RABBITMQ_MANAGEMENT_URL` or launches a container. Waits for AMQP readiness, creates a UUID-suffixed vhost, grants the built-in user full permissions on it, and returns a `TestRabbitMq`.
- **`TestRabbitMq`** (interface) — The bundle returned: `url` (vhost-scoped AMQP), `vhost` (name), `management` (API handle), `stop()` (delete vhost + stop container if started).
- **`ManagementApi`** (interface) — Two operations: `queue(name)` to read a queue's declared definition/counters, and `dropConnections()` to close all vhost connections broker-side.
- **`ManagedQueue`** (interface) — Narrowed view of the management API's queue JSON (`type`, `durable`, `arguments`, `messages_ready`, `messages_unacknowledged`).
- **`call(base, path, init)`** — Internal `fetch` wrapper for the management API; injects Basic-Auth header (credentials stripped from URL).
- **`waitForBroker(url, timeoutMs)`** — Polls `amqplib.connect` via `retryUntil` until the broker accepts a connection.
- **`listConnections` / `closeAll`** — Poll the connections endpoint (to work around the broker's 5 s stats interval), then `DELETE` each connection.
- **`createVhost(base, vhost)`** — `PUT /vhosts/{vhost}` + `PUT /permissions/{vhost}/{user}` to grant `.*` access.
- **`jsonOrThrow`** — Parses a `Response` body, rejecting with a descriptive error on non-2xx.
- **`IMAGE`** — Defaults to `rabbitmq:4-management` (needed for the HTTP API); overridable via `NODE_TEST_RABBITMQ_IMAGE`.

## Relationships

- **Imports** `retryUntil` from `tests/support/eventually.ts` — used by `waitForBroker` to poll AMQP connectivity.
- **Imports** `containerEngine`, `containerEngineAvailable`, `startContainer` from `tests/support/container-engine.ts` — used to detect a container runtime and launch the RabbitMQ container when no external broker URL is set.
- **Consumed by** `tests/broker/queue-broker.test.ts` — the broker test suite calls `startRabbitMq()` to obtain its broker and management handle, and calls `stop()` in teardown.

## Notes

- The management image (`rabbitmq:4-management`) is required because production uses `rabbitmq:4-alpine`, which lacks the management HTTP plugin. This file deliberately uses the management variant.
- `fetch` is called with credentials stripped from the URL and re-attached as an `Authorization: Basic …` header, because undici's `fetch` rejects credentials embedded in the URL.
- `dropConnections` polls the connections list for up to 20 s before giving up, because the broker updates its stats on a ~5 s interval and a freshly-opened connection may not yet appear.
- The vhost name is `broker-test-<8 hex chars>` (UUID slice). If a previous run left the vhost behind (e.g., crash before `stop()`), the adapter's fixed queue/exchange names would trigger `PRECONDITION_FAILED` on the next run — the vhost-per-run design exists specifically to prevent this.
- The module refuses to skip: if neither an env-var broker nor a container engine is available, it rejects with an explanatory error rather than silently passing.
