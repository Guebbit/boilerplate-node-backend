---
source: src/modules/delivery/events.ts
sha256: cc2313c785eedfbaa20ae45587b5bf88cbe235ab1b8b7049d713e5c7186642ab
generated_at: 2026-11-08T05:30:19.899379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/events.ts

## Purpose

Defines the domain events emitted by the delivery module and their payload shapes. Uses TypeScript module augmentation to register payloads into the kernel's shared `DomainEventMap` (same pattern as `modules/orders/events.ts`), so every event rides the transactional outbox and exists exactly when the causing act does.

## Key elements

- **`ShipmentEventLine`** — one product line (`productId`, `quantity`) inside a shipment payload.
- **`ShipmentEventPayload`** — shared base for `shipment.shipped` / `shipment.delivered`: `orderId`, `shipmentId`, `fulfillmentOrderId`, `lines`.
- **`ShipmentLostPayload`** — extends the base with `reason`, optional `userId`/`message`, `owed` lines, and `expectedAt`.
- **`ShipmentShippedPayload`** — extends the base with optional `remainingUnits` (internal only; omitted by webhooks).
- **`FulfillmentOrderDelayed`** — payload for `fulfillment_order.delayed`: dates (`agreedAt`, `promisedAt`, `expectedAt`), `shipCountry`, and `reason` (`'moved'` | `'due'`).
- **`FulfillmentOrderHoldNoticed`** — payload for `fulfillment_order.hold_noticed`: `notice` type, optional staff `message`.
- **`declare module '@kernel/events'`** — augments `DomainEventMap` with eight events: `shipment.shipped`, `shipment.delivered`, `shipment.lost`, `fulfillment_order.held`, `fulfillment_order.hold_noticed`, `fulfillment_order.released`, `fulfillment_order.canceled`, `fulfillment_order.delayed`.
- **String constants** (`SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `SHIPMENT_LOST`, `FULFILLMENT_ORDER_HELD`, `FULFILLMENT_ORDER_HOLD_NOTICED`, `FULFILLMENT_ORDER_RELEASED`, `FULFILLMENT_ORDER_CANCELED`, `FULFILLMENT_ORDER_DELAYED`) — import-safe names for each event key.

## Relationships

- **`src/types/index.ts`** — supplies the shared types `FulfillmentHeldParamsNotice` and `ShipmentLostReason` used in payload definitions.
- **`src/modules/delivery/module.ts`** — reads `shipment.*` entries from the augmented `DomainEventMap` to build the webhooks public catalogue via `publicEvents`.
- **`src/modules/delivery/services/notify.ts`** — consumes `shipment.shipped` and `fulfillment_order.hold_noticed` to mail the buyer.
- **`src/modules/delivery/services/announce.ts` / `notice.ts`** — downstream consumers of the defined payloads.
- **`src/modules/delivery/index.ts`** — re-exports the payload interfaces and event-name constants for other modules.
- **`src/modules/delivery/tests/integration/override-sync.test.ts`** — exercises the "no `shipment.shipped` for admin-override forced shipments" contract documented in the `shipment.shipped` comment.

## Notes

- `shipment.*` events are public (projected into webhooks); `fulfillment_order.*` events are internal.
- The `shipment.lost` webhook exposes only the shared fields plus `reason` — never the free-text `message`.
- `userId` is optional on several payloads; it is absent once the account has been erased (no inbox to write to).
- `shipment.shipped` fires once per physical shipment; an order shipped in two goes fires it twice. It does **not** fire for forced shipments introduced by an admin status override.
- `shipment.delivered` fires immediately after `shipment.shipped` for digital fulfillments (born delivered).
- `expectedAt` in `ShipmentLostPayload` is present **exactly when** `owed` is non-empty.
- `promisedAt` in `FulfillmentOrderDelayed` is absent once an earlier notice told the buyer there was no date yet.
- `fulfillment_order.delayed` is purely informational: the shop tells the buyer, asks nothing, and cancels nothing on its own.
