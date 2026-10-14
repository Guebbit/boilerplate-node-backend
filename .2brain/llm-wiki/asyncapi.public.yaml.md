---
source: asyncapi.public.yaml
sha256: b24fa7fabdac4be20e1fd137ccf711683f146ef5ddfaa01c718715241c354438
generated_at: 2026-10-14T06:45:20.204428+00:00
model: ollama:qwen3.8:27b
---

# asyncapi.public.yaml

## Purpose

A **generated** AsyncAPI 3.0.0 bundle that consolidates all event-driven contracts (SSE streams and webhook deliveries) into a single public specification. It is produced by `npm run contracts:bundle` from per-module fragments and the root contract, and is intended for external consumers (dashboards, webhook subscribers, type generation) rather than for human editing.

## Key elements

- **`servers`** — Three server definitions: `sseLocal` (localhost SSE for observability), `sseNotificationsLocal` (localhost SSE for notifications), and `subscriberEndpoint` (a *variable* HTTPS host+path representing each subscriber's own configured URL, not a server this app runs).
- **`channels`** — All event topics: `observability.*` (metrics snapshot/update, heartbeat), `order.*` (created, paid, cancelled), `shipment.*` (shipped, delivered), `payment.*` (succeeded, failed, refunded), `return.*` (requested, received, closed), `example.published`, and `notifications.*` (created, deleted, read). SSE channels carry an `x-transport: sse` extension; webhook channels bind to `subscriberEndpoint`.
- **`operations`** — One-to-one send operations per channel, each linking a channel to its message schema. Descriptions document firing semantics (e.g., `order.paid` is derived from `status_changed` filtering on `to: 'paid'`).
- **`components.messages`** (referenced via `$ref`) — Payload schemas for every event, defined in the source fragments and inlined here.
- **`x-transport` extension** — Custom field read by `scripts/contracts/generate-asyncapi-types.ts` to select which channels produce SSE TypeScript types (not the channel name prefix).

## Relationships

- **`shared/contracts/asyncapi.root.yaml`** — Root fragment supplying `info`, license, and shared component definitions that this file inherits and re-exports.
- **`src/modules/observability/asyncapi.yaml`** — Source fragment contributing the `observability.*` channels and their SSE server binding.
- **`src/modules/webhooks/asyncapi.yaml`** — Source fragment contributing webhook channel scaffolding and the `subscriberEndpoint` variable server.
- **`src/modules/orders/events.ts`** — Emits the domain events (`order.created`, `order.status_changed`, `order.cancelled`) that the `webhookOrder*` operations fire; `order.paid` is derived here by filtering `status_changed` on `to: 'paid'`.
- **`src/modules/orders/services/crud.ts`** — `recordCreated` is the runtime call-site that triggers the `order.created` webhook operation.
- **`src/modules/payments/events.ts`** — Emits the payment domain events that back the `payment.*` webhook channels.

## Notes

- **DO NOT EDIT.** Regenerate via `npm run contracts:bundle`. All source-of-truth edits go into the per-module `asyncapi.yaml` / `asyncapi.webhooks.yaml` fragments or the root contract.
- The `subscriberEndpoint` server uses `{subscriberHost}` / `{subscriberPath}` variables — it is *not* a fixed address. Linters (`asyncapi-servers`, `asyncapi-channel-servers`) still pass because the merged module fragments bind channels to it.
- `version: 0.1.0` is intentionally pinned at alpha; the `check:asyncapi-breaking` script ignores this field, so bumping it will not trip CI.
- `x-transport: sse` is the authoritative marker for SSE channel selection in codegen — the `observability.` / `notifications.` name prefix is *not* what the generator keys on.
- The file lists sources in its header comment; if a module is missing from that list its fragment was not included in the last bundle run.
