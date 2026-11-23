---
source: src/modules/observability/asyncapi.yaml
source_sha256: 326ce6f95bac223903d3522058a175a0cf8e39622a06c8cbe91da3ad72199fa7
context_sha256: f906dad862af7735d170d6db5ae494873537b3ac345a84298daa5598e2b5a290
generated_at: 2026-11-22T05:59:59.724106+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/asyncapi.yaml

## Purpose
The observability module's AsyncAPI 3.0.0 contract for the Server-Sent Events (SSE) stream served at `/observability/events`. It is a complete, standalone document, so it can be linted on its own (`npm run lint:asyncapi:modules`). It is also a "slice": a bundler merges its server, channels, operations and components into the contracts at the repo root. The module owns these channels because it owns the route.

## Key elements
- **`info`**: exists only so the file is valid standalone. The real service-wide `info` and tags come from the root contract.
- **`servers.sseLocal`**: `localhost:3000` over `http`. It is declared here rather than in the root, so a bundle that omits this module also omits the server.
- **Channels** (all marked `x-transport: sse`):
  - `observability.metrics.snapshot`: sent once on connect.
  - `observability.metrics.updated`: periodic update, every 5 seconds.
  - `observability.heartbeat`: 15-second keep-alive.
- **Operations** (all `action: send`): `sseMetricsSnapshot`, `sseMetricsUpdated` and `sseHeartbeat`. Each binds to its channel and message.
- **`components.messages`**: `MetricsSnapshotEvent`, `MetricsUpdatedEvent` and `HeartbeatEvent`. All three use the same payload schema.
- **`components.schemas.ObservabilityMetricsPayload`**: a strict object (`additionalProperties: false`) with these required fields:
  - `timestamp` (date-time)
  - `uptimeSeconds` (integer >= 0)
  - `memory` (`MemoryUsage`: `rss`, `heapUsed`, `heapTotal`, `external`)
  - `http` (`HttpMetrics`: `totalRequests`, `totalErrors`)
  - `realtime` (`RealtimeMetrics`: `sseClients`)

  All numeric fields are non-negative integers.

## Relationships
- **`openapi.yaml`** (sibling): the REST counterpart, also a standalone slice. This file says memory values are in bytes and match what `GET /observability/health` publishes, so the two contracts are meant to agree on units.

## Notes
- The heartbeat message references `ObservabilityMetricsPayload`, the same schema as the metrics events, even though the operation description says the heartbeat carries no metrics.
- The file's comments say a generator script selects SSE channels by `x-transport: sse`, not by the `observability.` name prefix. New SSE channels need that marker.
- The file's comments say the payload shape comes from `buildObservabilityPayload` in `stream.ts`, and that `npm run gen:asyncapi` generates types from these schemas so the producer and the wire stay in sync.
- The `title` on the nested `memory`, `http` and `realtime` schemas fixes the generated TypeScript model names. Without it, Modelina would produce `AnonymousSchemaN` names that get renumbered when unrelated schemas are added.
- The snapshot and update events share one payload shape, so a client handles a single message type.
