---
source: src/modules/delivery/events.ts
sha256: bf612d4af6c11c69fb2574944afa2dd9b375f7a0df50f43abff26922fcd0934a
generated_at: 2026-10-15T10:27:12.841866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/events.ts

## Purpose

Defines the delivery module's domain event names, payload interfaces, and registers them into the kernel's app-wide `DomainEventMap` via TypeScript module augmentation. This file is the single source of truth for what the delivery module can emit, ensuring type-safe producers and consumers across the codebase.

## Key elements

- **`ShipmentEventLine`** – `{ productId, quantity }`; one entry per product line in a shipment payload.
- **`ShipmentEventPayload`** – Shared payload for `shipment.shipped` / `shipment.delivered`; carries `orderId`, `shipmentId`, `fulfillmentOrderId`, and `lines`.
- **`FulfillmentOrderDelayed`** – Payload for `fulfillment_order.delayed`; carries the agreed/expected dates, product titles, the `reason` (`'moved'` | `'passed'`), `needsAnswer`, and the optional `answerBy` deadline.
- **`declare module '@kernel/events'`** – Augments `DomainEventMap` with seven delivery events (see below).
- **Event-name constants** – `SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `FULFILLMENT_ORDER_HELD`, `FULFILLMENT_ORDER_RELEASED`, `FULFILLMENT_ORDER_CANCELLED`, `FULFILLMENT_ORDER_DELAYED`, `FULFILLMENT_ORDER_WAIT_EXPIRED`. Each is a plain string literal export so services and listeners reference the name symbolically instead of duplicating the literal.

## Relationships

- **`module.ts`** – Reads `publicEvents` to project the `shipment.*` events into the `webhooks` public catalogue; the `fulfillment_order.*` events remain internal.
- **`services/announce.ts`, `services/notice.ts`, `services/notify.ts`** – Producers (and in some cases consumers) of these events within the delivery module's transactional outbox.
- **`index.ts`** – Barrel re-export, making the event constants and payload types available to the rest of the app under the module's public path.
- **`tests/integration/override-sync.test.ts`** – Integration tests that exercise the admin override path, asserting the events emitted (or deliberately *not* emitted) by override-driven status changes.

## Notes

- Events ride the **transactional outbox**: they are written in the same DB transaction as the act that causes them, so they exist exactly when the act does.
- `shipment.*` events are **public** (surfaced via webhooks); `fulfillment_order.*` events are **internal** and not part of the webhooks catalogue.
- `shipment.shipped` fires **once per shipment leg**—an order split across two shipments emits it twice. It is **not** fired for forced shipments created by an admin status-override step.
- `fulfillment_order.wait_expired` is **re-announced by a daily sweep** until the cancel lands, so any listener (notably `returns`) must be **idempotent**.
- The module-augmentation pattern (rather than a central event registry) is deliberate; the rationale is documented in `modules/orders/events.ts`.
- `FulfillmentOrderDelayed.userId` is optional: once the buyer's account is erased there is no inbox to target, so the field is simply absent.
