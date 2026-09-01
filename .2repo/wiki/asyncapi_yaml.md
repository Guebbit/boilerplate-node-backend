# asyncapi.yaml

## Purpose
Generated AsyncAPI 2.6.0 contract that defines every real-time and event-driven channel in the boilerplate: SSE observability streams and RabbitMQ worker queues (email, PDF, image digest). It is the single source of truth for what flows over the wire and when; it exists so both humans and tooling share one canonical description without re-reading implementation code.

## Key elements
- **Servers** — `sseLocal` (HTTP on `localhost:3000`, SSE endpoint `/observability/events`) and `rabbitmqLocal` (AMQP on `localhost:5672` for job queues).
- **Channels (SSE)** — `observability.metrics.snapshot` (one-shot payload on connect), `observability.metrics.updated` (5 s periodic push), `observability.heartbeat` (15 s keep-alive). All three share the `ObservabilityMetricsPayload` schema.
- **Channels (RabbitMQ workers)** — `worker.email.send`, `worker.pdf.generate`, `worker.image.digest`. Each has a `publish` (producer side) and `subscribe` (consumer side) operation. Worker channels are scoped to `rabbitmqLocal` only.
- **Messages** — `MetricsSnapshotEvent`, `MetricsUpdatedEvent`, `HeartbeatEvent`, `EmailJobMessage`, `EmailJobConsumeMessage`, `PdfJobMessage`, `PdfJobConsumeMessage`, `ImageDigestJobMessage`, `ImageDigestJobConsumeMessage`. Consume messages mirror publish payloads (same schema, distinct `messageId`).
- **Schemas** — `ObservabilityMetricsPayload` (timestamp, uptime, memory, http, realtime counters), `EmailJobPayload`, `PdfJobPayload`, `ImageDigestJobPayload` (truncated in listing but referenced by messages).
- **`defaultContentType`** — `application/json` for every channel.
- **Tags** — single `implemented` tag indicating all channels are live in the runtime.

## Relationships
- **docker-compose.yml / docker-compose.production.yml** — Define the RabbitMQ broker (port 5672) and the API/worker containers that the `rabbitmqLocal` server and worker channels target. The spec's `localhost:5672` assumption matches the broker service in these compose files.
- **spectral.asyncapi.modules.yaml** — Spectral linting rules applied to this file (and the module-level AsyncAPI files) during CI, enforcing structural conventions (naming, required fields, etc.) on top of the AsyncAPI 2.6 schema.

## Notes
- **Do not edit directly.** The header states it is produced by `npm run contracts:bundle` from three sources (`shared/contracts/asyncapi.root.yaml`, `src/modules/observability/asyncapi.yaml`, `shared/contracts/asyncapi.workers.yaml`). Edit the sources and re-run the bundle script.
- **Consume-message `messageId` differs from publish.** For example, publish uses `worker.email.send` while consume uses `worker.email.job.consume`. Tooling that matches by `messageId` must treat them as distinct.
- **SSE channels have no `servers` override**, so they inherit both listed servers; in practice only `sseLocal` is used. The `heartbeat` channel carries the same `ObservabilityMetricsPayload` schema but is semantically a no-op keep-alive.
- **All schemas use `additionalProperties: false`**, so any new field added at runtime will fail strict validation.
