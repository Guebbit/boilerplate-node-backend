---
source: src/modules/returns/asyncapi.webhooks.yaml
sha256: 793336535c65ce33c500138007799cdac9d35d4f0f8ebfa06d350d653605dd01
generated_at: 2026-11-14T21:31:54.820031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/asyncapi.webhooks.yaml

## Purpose

AsyncAPI **fragment** (not a standalone document) declaring the three webhook events the returns module publishes: `return.requested`, `return.received`, and `return.closed`. A bundler script merges this fragment into the global `webhooks/asyncapi.yaml` only while the returns module is registered, so deleting the module removes these events from the contract automatically.

## Key elements

- **`channels`** — Three channels, each with `x-read-rule: read:Return`, a `$ref` to `#/servers/subscriberEndpoint`, and one message.
- **`operations`** — Three `send` actions (`webhookReturnRequested`, `webhookReturnReceived`, `webhookReturnClosed`), each mapped 1:1 to a domain-event service (`create.ts`, `receive.ts`, `close.ts`).
- **`components.messages`** — `ReturnRequestedEvent`, `ReturnReceivedEvent`, `ReturnClosedEvent`; each wraps a payload in the Standard Webhooks envelope `{ type, timestamp, data }` with `WebhookHeaders`.
- **`components.schemas`** — Payload objects (`ReturnRequestedPayload`, `ReturnReceivedPayload`, `ReturnClosedPayload`) and their envelope wrappers. All set `additionalProperties: false`.

## Relationships

- **`src/modules/returns/module.ts`** — The module's `publicEvents` export is the runtime code that actually fires these events. The `GET /webhooks/events` endpoint lists this fragment only while the module is registered.
- **`src/modules/returns/openapi.yaml`** — Payload schemas `$ref` into this file for shared domain enums: `ReturnReason`, `ReturnStatementChannel`, and `ReturnRemedy`. The bundler inlines those refs so the REST and event contracts share a single canonical list.

## Notes

- **Fragment, not a document.** It references `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders`, which are declared in the global `webhooks/asyncapi.yaml`. It is meaningless on its own; only the merged output is consumable.
- **Bundler script:** `scripts/contracts/asyncapi-section-fragments.ts` performs the merge. If you see these events "disappearing," check that the module is registered and the script ran.
- **Withdrawal-before-dispatch edge case:** `return.requested` is immediately followed by `return.closed` (the return is "born closed"); `order.canceled` is the signal that the order was canceled, not `return.closed`.
- **`return.closed` timing:** Can fire immediately after `return.received` (normal refund) *or* later when a payment sweep retries a previously refused refund. Consumers must not assume it arrives right after `return.received`.
- **`return.received` atomicity:** The stock-movement and status-migration are committed together *before* the event fires; consumers can rely on both being visible.
