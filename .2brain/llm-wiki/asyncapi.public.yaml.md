---
source: asyncapi.public.yaml
sha256: 81728214dfc774af4cbecb63d4c50038da96c8e1ca98b3f35ba68d98d578257e
generated_at: 2026-10-29T01:16:56.576879+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.public.yaml

## Purpose

Auto-generated AsyncAPI 3.0.0 contract that aggregates the real-time/event-driven message definitions from all modules into a single, versioned specification. It is the source of truth for code-generation scripts and the external contract for downstream consumers of SSE streams and webhook subscriptions. It is produced by `npm run contracts:bundle` and must never be edited by hand.

## Key elements

- **`asyncapi` / `info`** — Document metadata: version `0.1.0` (alpha, tracked alongside `openapi.root.yaml`), AGPL-3.0 license, and a `tags` list (`implemented`) that flags channels whose handlers exist in the runtime.
- **`servers`** — Three entries:
  - `sseLocal` — `localhost:3000`, the origin for `/observability/events` SSE streams.
  - `subscriberEndpoint` — A *variable* server (`{subscriberHost}/{subscriberPath}`); each webhook subscription supplies its own URL, so no fixed address is printed.
  - `sseNotificationsLocal` — `localhost:3000`, the origin for `/notifications/stream`.
- **`channels`** — 24 channels grouped by domain (observability, order, shipment, payment, return, example, user, notifications). SSE channels carry the `x-transport: sse` extension; webhook channels bind to `subscriberEndpoint`.
- **`messages`** (via `$ref` into `components/messages`) — One named event per channel (e.g. `OrderCreatedEvent`, `PaymentDisputeOpenedEvent`, `NotificationCreatedEvent`), providing the payload shape.
- **`operations`** — Explicit send/receive bindings tying each channel to a named operation (e.g. `sseMetricsSnapshot`, `sseMetricsUpdated`), with prose descriptions of timing and semantics.
- **`x-transport` extension** — Read by `scripts/contracts/generate-asyncapi-types.ts` to distinguish SSE channels from webhook channels (the name prefix alone is not sufficient).

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — Primary source fragment merged into this file by the bundler; provides the document skeleton (`asyncapi`, `info`, shared `components`).
- **`src/modules/observability/asyncapi.yaml`** — Contributes the `observability.*` channels and their message definitions.
- **`src/modules/webhooks/asyncapi.yaml`** — Contributes the webhook-delivery channel patterns and the `subscriberEndpoint` server definition.
- **`src/modules/orders/events.ts`** — Runtime implementation of the `OrderCreatedEvent`, `OrderPaidEvent`, etc. payloads referenced here; `crud.ts` in the same module emits these events.
- **`src/modules/payments/events.ts`** — Runtime implementation of the `PaymentSucceededEvent`, `PaymentDispute*Event`, etc. payloads.
- **Codegen** — `scripts/contracts/generate-asyncapi-types.ts` consumes this file (via the `x-transport` hint) to emit TypeScript SSE-client types.

## Notes

- **Do not edit.** The header is regenerated on every `npm run contracts:bundle` run.
- **Version field is informational only.** The breaking-change linter explicitly ignores `info.version`; bump it in the source fragments, not here.
- **`subscriberEndpoint` is not a host this service runs.** It represents an *outbound* connection the backend opens to a subscriber's URL. Spectral rules still pass because module fragments bind their channels to this variable server.
- **`x-transport` is load-bearing.** Removing it (or adding a channel with the `observability.` prefix but no `x-transport`) will silently misclassify the channel during type generation.
- **Source list in the header is the authoritative merge order.** If a channel or message is missing from this file, check whether its module fragment is listed there.
