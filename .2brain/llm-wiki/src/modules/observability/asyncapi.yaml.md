---
source: src/modules/observability/asyncapi.yaml
sha256: 7703c616d60ceec9b065c49c33b007f7707d1392e3aaf30d264646adf4fd80b5
generated_at: 2026-09-23T18:55:12.520819+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/asyncapi.yaml

## Purpose

Self-contained AsyncAPI 3.0.0 document that specifies the SSE stream served at `/observability/events`. It exists as a lintable, independently readable slice of the service's async contract; a bundler later merges its servers, channels, operations, and components into the repo-root contract.

## Key elements

- **`servers.sseLocal`** — local HTTP server (`localhost:3000`) bound to the SSE route. Declared here (not in the root) so a bundle that drops this module also drops the server.
- **`channels.observability.metrics.snapshot`** — initial metrics snapshot sent once on SSE connect, so the dashboard renders populated data immediately.
- **`channels.observability.metrics.updated`** — periodic metrics push (every 5 s) for the lifetime of the connection.
- **`channels.observability.heartbeat`** — 15-second keep-alive with no metric data; prevents idle-proxy timeouts and distinguishes "alive, nothing changed" from "stream died."
- **`operations.sseMetricsSnapshot` / `sseMetricsUpdated` / `sseHeartbeat`** — send-actions bound to the three channels above.
- **`components.schemas.ObservabilityMetricsPayload`** — the single shared payload shape (`timestamp`, `uptimeSeconds`, `memory.{rss,heapUsed,heapTotal,external}`, `http.{totalRequests,totalErrors}`, `realtime.{sseClients}`). All three messages use this one schema.
- **`info` block** — present only to make the file a valid standalone AsyncAPI document; the authoritative service-level `info` lives in the root contract.

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — the bundler merges this file's servers, channels, operations, and components into the root contract. Service-wide facts (tags, the real `info`) come from the root; this file's `info` is discarded in the merged output.
- **`asyncapi.public.yaml`** — the public-facing (bundled) variant that consumers lint and read; this module's slice is folded into it.
- **`src/modules/observability/module.ts`** — owns the `/observability/events` route. Its `buildObservabilityPayload` function is type-checked against the schemas generated from this file (`npm run gen:asyncapi`), preventing the wire format and the producer from drifting.

## Notes

- Memory values in the payload are in **bytes**, matching `GET /observability/health`, so dashboards can compare directly without unit conversion.
- The snapshot and periodic update deliberately share the **same** payload schema so clients handle one message type, not two.
- Lint with `npm run lint:asyncapi:modules`; the file must pass as a standalone AsyncAPI document because the bundler treats it as an independent unit before merging.
