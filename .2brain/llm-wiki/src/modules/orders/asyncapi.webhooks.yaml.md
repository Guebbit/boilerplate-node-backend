---
source: src/modules/orders/asyncapi.webhooks.yaml
sha256: a3b06bec625626631ff68d86540220ef12c61627e11f84c14524e939979599ec
generated_at: 2026-11-14T20:31:49.306071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/asyncapi.webhooks.yaml

## Purpose

Defines the orders module's four outbound webhook events (`order.created`, `order.paid`, `order.canceled`, `order.redacted`) as an **AsyncAPI fragment**. It is not a standalone document: the bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges it into the top-level `webhooks` section, and `GET /webhooks/events` lists these events only while the orders module is registered. Deleting the module removes its events from the contract.

## Key elements

- **`channels`** — Four channel definitions, each bound to the shared `#/servers/subscriberEndpoint` and carrying an `x-read-rule: display:Order` tag.
- **`operations`** — Four `send` operations (`webhookOrderCreated`, `webhookOrderPaid`, `webhookOrderCanceled`, `webhookOrderRedacted`) describing *when* each fires and the domain source (e.g. `recordCreated` in `orders/services/crud.ts`).
- **`components.messages`** — One message per event; all share the `WebhookHeaders` schema (declared in the parent document) and a module-specific envelope payload.
- **`components.schemas`** —
  - `OrderIdPayload` — minimal `{ orderId }` body used by created / paid / redacted events.
  - `OrderCanceledPayload` — adds a `cause` enum (`customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch`, `lost`).
  - `OrderCreatedEnvelope`, `OrderPaidEnvelope`, `OrderCanceledEnvelope`, `OrderRedactedEnvelope` — the Standard Webhooks envelope `{ type, timestamp, data }` with a single-value `type` enum and a `title` on each enum for stable Modelina codegen naming.

## Relationships

- **`src/modules/orders/module.yaml`** — This fragment belongs to that module. The bundler includes it in the merged contract and the events endpoint *only while the module is registered*. The module's `publicEvents` (declared in its code) is what actually emits these events at runtime.
- **`src/modules/payments/asyncapi.webhooks.yaml`** — `order.canceled` deliberately carries **no refund information**; whether money moved is the domain of the payments module, and subscribers learn that from the refund events defined in the payments webhooks fragment.
- **`src/modules/delivery/module.yaml`** — The `lost` value in the `OrderCancelCause` enum represents a parcel lost in transit; such units are explicitly *not* restocked, tying the cancel semantics to the delivery domain.

## Notes

- **Fragment, not document.** `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` are resolved only after the bundler merges this file into the parent `webhooks/asyncapi.yaml`. Opening this file in isolation will show unresolved `$ref`s.
- **`order.paid` is derived, not first-class.** It is produced by filtering `order.status_changed` where `to === 'paid'` (see `orders/events.ts`), not by a dedicated domain event.
- **`order.redacted` ≠ erasure.** It fires from the nightly `reap:orders` sweep when the personal-data window closes, inside the scrub's own transaction. The buyer's account-erasure event only detaches the account and does *not* trigger this webhook.
- **`title` on enum properties is load-bearing.** Without it, Modelina generates `AnonymousSchemaN` identifiers that shift on every unrelated schema addition. Each `type` field and the `cause` field carry a `title` for this reason.
- **`additionalProperties: false`** is set on every envelope and payload schema; consumers should not expect extra fields.
