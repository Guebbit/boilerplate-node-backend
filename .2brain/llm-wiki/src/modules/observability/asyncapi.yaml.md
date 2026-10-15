---
source: src/modules/observability/asyncapi.yaml
sha256: 326ce6f95bac223903d3522058a175a0cf8e39622a06c8cbe91da3ad72199fa7
generated_at: 2026-10-15T10:53:59.992842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/asyncapi.yaml

## Purpose

Standalone AsyncAPI 3.0.0 document defining the Server-Sent Events stream the observability module serves at `/observability/events`. It is written as a complete, independently lintable contract so it can be read and validated without the rest of the repo; the bundler merges its servers, channels, operations, and components into the repo-root contract at build time.

## Key elements

- **`servers.sseLocal`** – Local HTTP server (`localhost:3000`) declared alongside its channels so that excluding this module from a bundle also drops the server.
- **`channels.observability.metrics.snapshot`** – One-shot initial metrics snapshot sent on SSE connect. Carries `x-transport: sse`.
- **`channels.observability.metrics.updated`** – Periodic (5 s) metrics push while the connection is open. Carries `x-transport: sse`.
- **`channels.observability.heartbeat`** – 15-second keep-alive carrying no new metrics, preventing idle-proxy disconnects. Carries `x-transport: sse`.
- **`operations.sseMetricsSnapshot` / `sseMetricsUpdated` / `sseHeartbeat`** – Three `send` actions, one per channel, describing when each message is emitted.
- **`components.messages.*`** – `MetricsSnapshotEvent`, `MetricsUpdatedEvent`, `HeartbeatEvent`; all three share the same payload schema.
- **`components.schemas.ObservabilityMetricsPayload`** – The wire shape: `timestamp`, `uptimeSeconds`, `memory` (rss, heapUsed, heapTotal, external), `http` (totalRequests, totalErrors), `realtime` (sseClients). All integers are in BYTES, matching `GET /observability/health`.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** – Supplies the service-wide `info` block, tags, and other global facts. This file's local `info` exists only to keep the document valid in isolation; the root contract's values take precedence after bundling.
- **`asyncapi.public.yaml`** – The bundled output. This file's `servers`, `channels`, `operations`, and `components` are merged into it by the contract bundler.
- **`src/modules/observability/module.ts`** – The owning module. It registers the `/observability/events` SSE route and implements the producer whose output is checked against the types generated from this file's schemas.

## Notes

- The `x-transport: sse` extension (not the channel name prefix) is what `scripts/contracts/generate-asyncapi-types.ts` reads to identify SSE channels for type generation.
- `title` fields on the nested sub-schemas (`MemoryUsage`, `HttpMetrics`, `RealtimeMetrics`) are load-bearing: omitting them causes Modelina to emit unstable `AnonymousSchemaN` names that renumber on unrelated changes.
- `npm run gen:asyncapi` turns the schemas here into TypeScript types; `stream.ts`'s `buildObservabilityPayload` is type-checked against them, which is the mechanism that keeps the wire format and the producer in sync.
- `npm run lint:asyncapi:modules` validates this file standalone—no need to resolve the full repo contract first.
