---
source: src/modules/observability/asyncapi.yaml
sha256: 326ce6f95bac223903d3522058a175a0cf8e39622a06c8cbe91da3ad72199fa7
generated_at: 2026-11-08T06:37:44.833052+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/asyncapi.yaml

## Purpose

AsyncAPI 3.0.0 document that specifies the Server-Sent Events stream served at `/observability/events`. It declares the channels, operations, and payload schemas for the observability dashboard's live metrics feed. The file is a self-contained "slice": a bundler merges its `servers`, `channels`, `operations`, and `components` into the repo-root contract (`shared/contracts/asyncapi.root.yaml`), while the local `info` block exists solely to make the file lintable and readable in isolation.

## Key elements

- **`servers.sseLocal`** — Local HTTP endpoint (`localhost:3000`). Declared here (not in the root) because a server is only reachable through the channels bound to it; excluding this module from a bundle also excludes the server.
- **`channels.observability.metrics.snapshot`** — One-shot initial snapshot sent on SSE connect so the dashboard renders populated immediately.
- **`channels.observability.metrics.updated`** — Periodic metrics push every 5 s while the connection is open.
- **`channels.observability.heartbeat`** — 15-s keep-alive with no metrics payload; prevents idle-proxy disconnects and lets clients distinguish "alive, no change" from "stream died".
- **`x-transport: sse`** — Custom extension on each channel. The type-generator script (`scripts/contracts/generate-asyncapi-types.ts`) reads this to select SSE channels, *not* the `observability.` name prefix.
- **`operations.sseMetricsSnapshot` / `sseMetricsUpdated` / `sseHeartbeat`** — Send operations bound to the three channels; all carry the same `ObservabilityMetricsPayload` shape so a client handles one message type.
- **`components.schemas.ObservabilityMetricsPayload`** — The wire schema: `timestamp`, `uptimeSeconds`, `memory` (rss, heapUsed, heapTotal, external — all bytes), `http` (totalRequests, totalErrors), `realtime` (sseClients). Sub-objects carry explicit `title` values (`MemoryUsage`, `HttpMetrics`, `RealtimeMetrics`) to stabilize generated TypeScript model names and avoid Modelina's `AnonymousSchemaN` renumbering.

## Relationships

- **`src/modules/observability/openapi.yaml`** — Sibling contract in the same module. Together they form the observability module's API surface: `openapi.yaml` documents the REST endpoints (e.g. `GET /observability/health`), while this file documents the SSE stream. Both are independent slices that the bundler merges into the repo-root OpenAPI/AsyncAPI contracts. Memory values in the SSE payload are intentionally in the same units (bytes) as the REST health endpoint so dashboards can compare them directly.

## Notes

- **Payload ↔ producer contract.** `npm run gen:asyncapi` generates TypeScript types from the schemas here; `buildObservabilityPayload` in `stream.ts` is type-checked against them. Drift between wire format and producer is caught at compile time.
- **Linting.** The file is linted independently via `npm run lint:asyncapi:modules`; the `info` block must be kept valid for this to work.
- **Bundler dependency.** Service-wide `tags`, `info`, and any global components live in `shared/contracts/asyncapi.root.yaml`, not here. Do not add service-level facts to this file.
- **Heartbeat vs. metrics tick.** The heartbeat (15 s) and the metrics tick (5 s) are independent intervals. A client should treat the heartbeat as a liveness signal, not a data update.
