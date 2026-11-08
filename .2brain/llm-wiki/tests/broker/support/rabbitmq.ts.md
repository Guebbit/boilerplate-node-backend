---
source: tests/broker/support/rabbitmq.ts
sha256: 520b36655ee3761733815f3636a0135ca3e3bf1341f036e50efb9bf26a368c71
generated_at: 2026-11-08T09:17:34.318061+00:00
model: ollama:qwen3.8:27b
---

# tests/broker/support/rabbitmq.ts

## Purpose

Provides a fully managed, per-run RabbitMQ broker for the queue-broker integration suite. It either connects to a CI-supplied instance or spins up a `rabbitmq:4-management` container, then creates an isolated virtual host (with full permissions for the built-in `guest` user) so each run gets a clean topology. It also exposes a small typed management-API handle for asserting queue declarations and force-dropping connections.

## Key elements

- **`startRabbitMq()`** – Main entry point. Resolves broker source (env URL vs. container), waits for AMQP readiness, creates the vhost, and returns a `TestRabbitMq` object.
- **`TestRabbitMq`** – Returned handle: scoped AMQP `url`, `vhost` name, `management` API, and `stop()` (deletes vhost, stops container if this run started one).
- **`ManagementApi`** – Two methods the suite actually calls: `queue(name)` (returns declared definition) and `dropConnections()` (closes all vhost connections broker-side).
- **`ManagedQueue`** – Narrowed shape of the management API's queue JSON (`type`, `durable`, `arguments`, message counters).
- **`waitForBroker`** – Polls an AMQP connect/close cycle until the broker accepts a connection (90 s timeout, 500 ms interval).
- **`listConnections` / `closeAll`** – Polls the management API until at least one connection appears (to work around the broker's ~5 s stats interval), then issues `DELETE` on each.
- **`createVhost`** – `PUT /vhosts/{name}` followed by `PUT /permissions/{vhost}/{user}` granting full `.*` rights.
- **`call` / `jsonOrThrow`** – Thin `fetch` wrapper that injects Basic-auth headers (since `fetch` rejects URL-embedded credentials) and rejects on non-2xx.

## Relationships

- **`tests/support/container-engine.ts`** – Supplies `containerEngineAvailable()` and `startContainer()` used to launch the RabbitMQ container when no `NODE_TEST_RABBITMQ_URL` is set.
- **`tests/support/eventually.ts`** – Supplies `retryUntil()` used by `waitForBroker` to poll for AMQP readiness.
- **`tests/broker/queue-broker.test.ts`** – Primary consumer; calls `startRabbitMq()` to obtain the broker URL and management handle for its assertions.

## Notes

- The **management image** (`rabbitmq:4-management`) is mandatory: production runs `rabbitmq:4-alpine`, which ships without the management plugin. This file never runs against the production image.
- **Vhost-per-run** is not optional isolation—it prevents `PRECONDITION_FAILED` on the adapter's fixed queue/exchange names (`worker.email.send`, `dead-letter`) if a previous run's topology lingered.
- `stop()` is **best-effort**: vhost-deletion errors are swallowed (`.catch(() => undefined)`) so teardown never blocks test reporting.
- The suite **refuses to skip**: if neither an env URL nor a container engine is available, it rejects with an explicit error rather than silently passing.
- `NODE_TEST_RABBITMQ_MANAGEMENT_URL`, when unset, is derived from the AMQP URL's host/credentials on port **15672**.
