# asyncapi.public.yaml

## Purpose

A **generated** (do-not-edit) AsyncAPI 2.6.0 contract that bundles the project's real-time/event-driven API surface into a single distributable spec. It is produced by `npm run contracts:bundle` from `shared/contracts/asyncapi.root.yaml` and `src/modules/observability/asyncapi.yaml`, and serves as the canonical public reference for what the SSE endpoint at `/observability/events` emits and when.

## Key elements

- **`servers.sseLocal`** — Declares a single local HTTP server (`localhost:3000`) hosting the SSE stream.
- **`channels.observability.metrics.snapshot`** — One-shot message pushed immediately on SSE connect so dashboards render populated. Same payload shape as the periodic update.
- **`channels.observability.metrics.updated`** — Periodic push every 5 s while the connection is open. Memory values are in **bytes**, matching `GET /observability/health`.
- **`channels.observability.heartbeat`** — 15-second keep-alive; prevents idle-proxy timeouts and lets clients distinguish "alive, no change" from "stream died."
- **`components.messages`** — Three message definitions (`MetricsSnapshotEvent`, `MetricsUpdatedEvent`, `HeartbeatEvent`); all three reference the same payload schema.
- **`components.schemas.ObservabilityMetricsPayload`** — The single shared object shape: `timestamp`, `uptimeSeconds`, `memory` (rss / heapUsed / heapTotal / external), `http` (totalRequests / totalErrors), `realtime` (sseClients). All integer counters are `minimum: 0`; every object block has `additionalProperties: false`.
- **`tags.implemented`** — Single tag marking contracts that are already wired into the backend runtime.

## Relationships

- **`asyncapi.yaml`** (`src/modules/observability/asyncapi.yaml`) — Direct source. The bundler merges this module-level spec with the root contract (`shared/contracts/asyncapi.root.yaml`) to produce this file. Edit the source, not this output.
- **`CHANGELOG.md`** — Records version-level changes; updates to the channels, messages, or payload schema in this file should be accompanied by a CHANGELOG entry per the project's release conventions.

## Notes

- The file header explicitly says **"DO NOT EDIT"**; any changes must go through the source YAML files and be re-bundled.
- All three message types (snapshot, updated, heartbeat) point to the **same** `ObservabilityMetricsPayload` schema. The heartbeat description says it carries "no metrics," but the schema still requires every field—consumers must tolerate (or ignore) the payload on heartbeat frames.
- `defaultContentType` is `application/json`; no alternative content types are declared.
- The spec is tagged `implemented`, meaning every channel listed is expected to be live in the runtime; there is no "planned" or "deprecated" tag in use.
