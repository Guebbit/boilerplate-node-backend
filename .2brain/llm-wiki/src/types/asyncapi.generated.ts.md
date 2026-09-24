---
source: src/types/asyncapi.generated.ts
sha256: 25cf45c5a80da7357956157efce90ca94c3cdeb9fe52549c13db77df22bfe587
generated_at: 2026-09-23T19:49:46.936574+00:00
model: ollama:qwen3.8:27b
---

# src/types/asyncapi.generated.ts

## Purpose

Auto-generated TypeScript type definitions and Zod validation schemas derived from `asyncapi.yaml`. It provides compile-time types, runtime validators, and channel-name constants for every event and message defined in the AsyncAPI specification, so the rest of the codebase can import a single canonical source for event payloads, envelope shapes, and channel identifiers.

## Key elements

- **Payload / envelope interfaces** — `ObservabilityMetricsPayload`, `OrderCreatedEnvelope`, `OrderPaidEnvelope`, `OrderShippedEnvelope`, `OrderCancelledEnvelope`, `PaymentSucceededEnvelope`, `PaymentFailedEnvelope`, `WebhookDeliverJobPayload`, `EmailJobPayload`, `ImageDigestJobPayload`, plus their nested sub-objects (`OrderIdPayload`, `PaymentEventPayload`, `OrderCancelledPayload`, etc.).
- **Event type aliases** — `OrderCreatedEvent`, `PaymentSucceededEvent`, `MetricsSnapshotEvent`, `HeartbeatEvent`, `WebhookDeliverJobMessage`, `EmailJobMessage`, `ImageDigestJobMessage`, etc. Each simply re-exports the corresponding interface under a human-friendly event name.
- **Zod schemas** — `*Schema` constants (e.g. `OrderCreatedEnvelopeSchema`, `EmailJobPayloadSchema`, `ObservabilityMetricsPayloadSchema`) for runtime validation. All object schemas use `.strict()`. Also `WebhookHeadersSchema` for validating inbound webhook headers.
- **Channel constants** — `OBSERVABILITY_CHANNELS`, `ORDER_CHANNELS`, `PAYMENT_CHANNELS`, `WORKER_CHANNELS` (`as const` objects) with their union types (`ObservabilityChannel`, `OrderChannel`, `PaymentChannel`, `WorkerChannel`).
- **SSE helpers** — `REALTIME_SSE_EVENT_NAMES`, `SseEventName`, `SseEventPayloadMap`, and the generic `SseEventPayload<T>` for typed SSE dispatch.

## Relationships

- **CLAUDE.md** — The project-level doc references this file as the single source of generated types and points contributors to `npm run gen:asyncapi` for regeneration. No runtime import relationship; the connection is purely documentary.

## Notes

- **Do not edit manually.** The header and the `eslint-disable` comment both flag this as generator output. Any change must go through `asyncapi.yaml` followed by `npm run gen:asyncapi`.
- **Anonymous schema names** (`AnonymousSchema3`, `AnonymousSchema8`, …) are artifacts of the generator's inlining of nested objects. They are stable within a given regeneration but are not semantically meaningful.
- **Strict Zod schemas** will reject unknown keys at runtime even though the TypeScript interfaces don't enforce it. Code that constructs these payloads manually must match the schema exactly.
- **`EmailJobPayload`** has an optional `from` field and optional sub-fields inside `request` (`subject`, `text`, `html`, `attachments`); the Zod schema mirrors these optionality choices.
- **SSE event names** are a subset of the observability channels. `SseEventPayload<T>` is the intended way to type a per-event handler without casting.
