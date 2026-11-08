---
source: src/modules/orders/asyncapi.webhooks.yaml
sha256: 601950f4d7208f68b4ca45b37ad7f7d6e1b849e1babbbc493da03e7b97dad1a1
generated_at: 2026-11-08T06:44:59.930244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/asyncapi.webhooks.yaml

## Purpose

AsyncAPI fragment declaring the four `order.*` webhook events exposed by the orders module. It is not a standalone document: it references shared servers and schema definitions owned by the root `webhooks/asyncapi.yaml` and is merged in by the bundler only while the orders module is registered. Its lifecycle is bound to the module—deleting the module removes these events from the public contract.

## Key elements

- **`channels`** – Four addresses (`order.created`, `order.paid`, `order.canceled`, `order.redacted`), each bound to the shared `subscriberEndpoint` server and a single message definition.
- **`operations`** – One `send` operation per channel. Descriptions document the firing trigger (e.g. `recordCreated` in `crud.ts`, a filtered `status_changed` listener, the nightly `reap:orders` sweep).
- **`components.messages`** – `OrderCreatedEvent`, `OrderPaidEvent`, `OrderCanceledEvent`, `OrderRedactedEvent`. Each carries the shared `WebhookHeaders` plus a module-specific envelope schema.
- **`components.schemas`**
  - `OrderIdPayload` – minimal `{ orderId }` body shared by three of the four events.
  - `OrderCreatedEnvelope` / `OrderPaidEnvelope` / `OrderRedactedEnvelope` – Standard Webhooks envelope (`type`, `timestamp`, `data` wrapping `OrderIdPayload`).
  - `OrderCanceledPayload` – extends the base with a `cause` enum (`customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch`, `lost`).
  - `OrderCanceledEnvelope` – envelope wrapping `OrderCanceledPayload`.

## Relationships

- **`src/modules/orders/module.yaml`** – The module's `publicEvents` (declared in `module.ts`) are the runtime source that actually fires these four events. This file is the *contract* side; the module is the *emitter* side.
- **`src/modules/payments/asyncapi.webhooks.yaml`** – Sibling fragment for `payment.*` events. The `order.canceled` description explicitly defers refund semantics to `payment.refunded`; subscribers should not infer a refund from the cancel event alone.
- **`src/modules/delivery/module.yaml`** – Likely consumer of `order.created` / `order.paid` to kick off fulfillment; appears in the dependency graph as a neighbor subscriber.

## Notes

- **Fragment, not document.** `$ref` targets like `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders` do not resolve in isolation. Linting this file alone will flag them as broken.
- **`title` on enum fields is a codegen workaround.** Without an explicit `title`, Modelina names the generated type `AnonymousSchemaN` and renumbers it on every unrelated addition. Renaming these titles is a breaking change for downstream generated clients.
- **`order.paid` is not its own domain event.** It is derived by filtering the generic `status_changed` event on `to: 'paid'` (see `orders/events.ts`). There is no dedicated `OrderPaid` event class in the domain layer.
- **`order.redacted` ≠ erasure.** The event fires from the nightly retention sweep when the personal-data window expires, in the scrub's own transaction. The initial account erasure only detaches the account and does *not* emit this webhook. The order row is retained as the invoice.
- **`lost` cause suppresses restock.** When `cause` is `lost`, the units are not returned to stock because they were never on the shelf to come back from. Subscribers should treat `lost` as terminal for inventory.
