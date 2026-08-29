# src/types/asyncapi.generated.ts

## Purpose

Auto-generated TypeScript type definitions and channel-name constants derived from `asyncapi.yaml`. It gives the rest of the codebase compile-time access to message payload shapes (observability metrics, email/PDF jobs) and canonical channel identifiers without hand-maintaining them.

## Key elements

- **`ObservabilityMetricsPayload`** — top-level metrics envelope; nests `AnonymousSchema3` (memory), `AnonymousSchema8` (HTTP counters), `AnonymousSchema11` (SSE client count).
- **`EmailJobPayload` / `AnonymousSchema13`** — shape of an email-job message (recipient, subject, body, template, data).
- **`PdfJobPayload`** — shape of a PDF-generation job (template path, data, output path).
- **Event/message type aliases** (`MetricsSnapshotEvent`, `HeartbeatEvent`, `EmailJobMessage`, `PdfJobConsumeMessage`, etc.) — thin aliases that map AsyncAPI operation names to the payload interfaces above, giving call-sites semantically distinct names for the same underlying shape.
- **`OBSERVABILITY_CHANNELS` / `WORKER_CHANNELS`** — `as const` objects holding the canonical channel-string identifiers (e.g. `'observability.heartbeat'`, `'worker.email.send'`).
- **`ObservabilityChannel` / `WorkerChannel`** — union types built from the channel constants for safe switching on channel names.
- **`REALTIME_SSE_EVENT_NAMES` / `SseEventName`** — the subset of observability channels exposed over SSE.
- **`SseEventPayloadMap` / `SseEventPayload<TEventName>`** — maps an SSE event name to its concrete payload type; the generic lets consumers write `SseEventPayload<'observability.heartbeat'>` and get the right shape.

## Relationships

- **`scripts/generate-asyncapi-types.ts`** — the generator script that produces this file when `npm run gen:asyncapi` is executed. Edits to `asyncapi.yaml` require re-running that script; this file is the output.
- **`src/types/index.ts`** — barrel file that re-exports the symbols from this module so the rest of the codebase can `import { … } from '@/types'` without referencing the generated path directly.

## Notes

- **Do not edit manually.** The file header and the `npm run gen:asyncapi` regeneration command make this explicit; any local change will be overwritten on the next generation run.
- **`AnonymousSchema*` names are generator artifacts**, not intentional design. They appear because the source YAML uses inline (unnamed) object schemas. If the AsyncAPI spec is updated to name those sub-schemas, the generated names will change accordingly.
- The `/* eslint-disable @typescript-eslint/naming-convention */` directive at the top suppresses warnings for the quoted property keys (`'timestamp'`, `'rss'`, …) and the `AnonymousSchema` identifiers.
- All three observability event aliases (`MetricsSnapshotEvent`, `MetricsUpdatedEvent`, `HeartbeatEvent`) currently resolve to the identical `ObservabilityMetricsPayload` interface; they exist for semantic clarity at call-sites rather than structural differences.
