# src/modules/observability/asyncapi.yaml

## Purpose

AsyncAPI 2.6.0 contract defining the three SSE channels served at `/observability/events` by the observability module. It is a self-validating slice that a bundler merges (servers, channels, components) into the service-wide contract; the `info` block exists only so the file can be linted and opened standalone.

## Key elements

- **`servers.sseLocal`** — the HTTP endpoint (`localhost:3000`) for the SSE route. Declared here rather than at the root so that removing this module from the bundle also removes the server.
- **`channels.observability.metrics.snapshot`** — one-shot message sent immediately on SSE connect so a dashboard renders populated content without waiting for the first 5-second tick.
- **`channels.observability.metrics.updated`** — periodic push every 5 s while the connection is open.
- **`channels.observability.heartbeat`** — 15-second keep-alive with no metric change; prevents idle-proxy disconnects and lets clients distinguish "alive, unchanged" from "stream died."
- **`components.messages.MetricsSnapshotEvent` / `MetricsUpdatedEvent` / `HeartbeatEvent`** — three message wrappers; all three reference the *same* payload schema so a client handles one shape.
- **`components.schemas.ObservabilityMetricsPayload`** — the single wire shape: `timestamp`, `uptimeSeconds`, `memory` (rss / heapUsed / heapTotal / external, all bytes), `http` (totalRequests / totalErrors), `realtime` (sseClients). All objects are `additionalProperties: false`.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — the service-wide root contract. The bundler merges this file's `servers`, `channels`, and `components` into it, adding global `tags` and the authoritative `info`. This file's `info` is a stub that will be overridden.
- **`stream.ts`** — the producer side. `npm run gen:asyncapi` generates TypeScript types from the schemas in this file; `buildObservabilityPayload` in `stream.ts` is type-checked against those generated types, which is the mechanism that keeps the wire contract and the runtime emitter in lockstep.

## Notes

- All memory figures are **bytes** — the same unit `GET /observability/health` uses — so a dashboard comparing the two needs no unit conversion.
- The snapshot and periodic messages share one payload schema intentionally; adding a second shape would force clients to branch on channel name.
- The `info` block is not the source of truth for service metadata; treat it as a linting placeholder.
