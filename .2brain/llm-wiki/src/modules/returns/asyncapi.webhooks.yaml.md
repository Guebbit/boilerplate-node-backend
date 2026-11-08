---
source: src/modules/returns/asyncapi.webhooks.yaml
sha256: fb5067a6f49efc8cd2ef02b7c9754c9000086a4131f88e0ebef0324990cc84a2
generated_at: 2026-11-08T07:55:14.952219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/asyncapi.webhooks.yaml

## Purpose

AsyncAPI **fragment** (not a standalone document) that declares the three webhook events the returns module emits: `return.requested`, `return.received`, and `return.closed`. A bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges this file into the `webhooks` section of the global `webhooks/asyncapi.yaml` only while the returns module is registered; deleting the module removes these events from the contract entirely.

## Key elements

- **Channels** — `return.requested`, `return.received`, `return.closed`: each binds a `subscriberEndpoint` server ref and one named message.
- **Operations** — `webhookReturnRequested`, `webhookReturnReceived`, `webhookReturnClosed`: `action: send`, each pointing back to its channel. Descriptions map 1-to-1 to domain events in `create.ts`, `receive.ts`, and `close.ts` respectively.
- **Messages** (`components.messages`) — `ReturnRequestedEvent`, `ReturnReceivedEvent`, `ReturnClosedEvent`: standard Webhooks shape (`headers` from shared `WebhookHeaders` schema, `payload` from the local envelope schema).
- **Payload schemas** — `ReturnRequestedPayload` (returnId, orderId, reason, requestedAt, optional statedVia), `ReturnReceivedPayload` (returnId, orderId), `ReturnClosedPayload` (returnId, orderId, refundAmount, currency, optional remedy). All set `additionalProperties: false`.
- **Envelope schemas** — `ReturnRequestedEnvelope`, `ReturnReceivedEnvelope`, `ReturnClosedEnvelope`: fixed `{ type, timestamp, data }` wrapper where `type` is a single-value enum matching the channel name.

## Relationships

- **`src/modules/returns/module.ts`** — the module's `publicEvents` array is the runtime source that fires the events described here. This file is the *contract* for those events.
- **`src/modules/returns/openapi.yaml`** — three `$ref` targets point into that file: `ReturnReason`, `ReturnStatementChannel`, and `ReturnRemedy`. The bundler copies those schemas in at build time so REST and event contracts share one enum.
- **`webhooks/asyncapi.yaml`** (referenced, not listed as a graph neighbor) — declares `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders`, both referenced here. Without that parent this fragment is unresolvable.
- **`scripts/contracts/asyncapi-section-fragments.ts`** — performs the merge of this fragment into the global AsyncAPI document.

## Notes

- **Fragment, not document.** It references `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` without defining them. Opening this file in a standalone AsyncAPI tool will show unresolved refs.
- **Withdrawal-before-dispatch edge case.** A withdrawal fires `return.requested` *immediately followed by* `return.closed` (the return is "born closed"). Consumers must tolerate that sequence; `order.canceled` carries the order-level signal.
- **`return.received` fires after a joint commit.** The stock movement and status change are committed together before the event fires, so consumers can assume both are visible.
- **`return.closed` can fire twice in different contexts** — right after `return.received` (normal refund) or later when a previously refused payment completes on the next sweep. The event payload is the same shape either way.
- **`additionalProperties: false`** is set on every payload and envelope schema; adding a field requires a schema change here *and* in the emitting code.
