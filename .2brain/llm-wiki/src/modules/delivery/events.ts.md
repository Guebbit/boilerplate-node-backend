---
source: src/modules/delivery/events.ts
sha256: 4760439e2c08d2efbfc5331375dc712048d63bb1f0e46f05b5bcbfafcddab19b
generated_at: 2026-10-29T03:34:48.411218+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/events.ts

## Purpose

Defines the delivery module's domain event payloads by augmenting the kernel's `DomainEventMap` (via `declare module '@kernel/events'`). Each event is written transactionally in the outbox at the moment the causing act occurs. The file exists so that every consumer—this module's services, the `notifications` module, `tickets`, and the public webhook catalogue—shares one typed contract for what each event carries.

## Key elements

- **`ShipmentEventLine` / `ShipmentEventPayload`** — shared shape for `shipment.shipped` and `shipment.delivered`: order/shipment/fulfillment IDs plus per-product lines.
- **`ShipmentLostOwedLine` / `ShipmentLostPayload`** — payload for `shipment.lost`; adds `reason`, optional `userId`/`message`, and the `owed` lines + `expectedAt` the buyer is told.
- **`ShipmentShippedPayload`** — extends the shared shipment payload with optional `remainingUnits` (internal only; omitted from the public webhook).
- **`FulfillmentOrderDelayed`** — payload for `fulfillment_order.delayed`; carries agreed/promised/expected dates, `shipCountry`, and `reason` (`'moved' | 'due'`).
- **`FulfillmentOrderHoldNoticed`** — payload for `fulfillment_order.hold_noticed`; buyer-safe notice (`check_address` or `delayed`) plus optional staff `message`.
- **`declare module '@kernel/events'`** — registers all eight event names (`shipment.shipped`, `shipment.delivered`, `shipment.lost`, `fulfillment_order.held`, `fulfillment_order.hold_noticed`, `fulfillment_order.released`, `fulfillment_order.cancelled`, `fulfillment_order.delayed`) into the app-wide `DomainEventMap`.
- **String constants** (`SHIPMENT_SHIPPED`, `SHIPMENT_DELIVERED`, `SHIPMENT_LOST`, `FULFILLMENT_ORDER_HELD`, `FULFILLMENT_ORDER_HOLD_NOTICED`, `FULFILLMENT_ORDER_RELEASED`, `FULFILLMENT_ORDER_CANCELLED`, `FULFILLMENT_ORDER_DELAYED`) — exported literals matching the keys above, for use in `emit()` / subscribe calls.

## Relationships

- **`src/modules/delivery/module.ts`** — reads `publicEvents` from this file's event names to project `shipment.*` into the `webhooks` public catalogue.
- **`src/modules/delivery/services/notify.ts`** — consumes `shipment.shipped`, `shipment.lost`, and `fulfillment_order.delayed` to send buyer emails.
- **`src/types/index.ts`** — source of `FulfillmentHeldParamsNotice` and `ShipmentLostReason`, imported by this file for the payload types.
- **`src/modules/delivery/index.ts`** — barrel re-export; makes the constants and interfaces available to other modules.
- **`src/modules/delivery/tests/integration/override-sync.test.ts`** — exercises the `shipment.shipped` flow in the context of admin status overrides (which explicitly do *not* fire `shipment.shipped`).

## Notes

- **Augmentation, not central list.** Events are declared here (not in a shared registry) so each module owns its contract; see `modules/orders/events.ts` for the same pattern.
- **`shipment.lost` `userId` is optional.** Absent when the buyer's account has been erased—there is no inbox to write to. Consumers must handle the undefined case.
- **`ShipmentShippedPayload.remainingUnits`** is internal; the public webhook projection in `module.ts` omits it.
- **`shipment.shipped` does not fire for admin-forced shipments** (status-override path). It fires once per actual shipment, so a split order can fire it multiple times.
- **`shipment.delivered` for digital fulfilments** fires immediately after `shipment.shipped`—there is no separate arrival event.
- **`fulfillment_order.delayed` is purely informational.** The shop tells the buyer; it never asks for consent or auto-cancels. The `tickets` module may later send a consent reminder using `promisedAt` + `shipCountry`.
- **`owed` vs. `expectedAt` pairing:** `expectedAt` is present *exactly when* `owed` is non-empty (empty array ⇒ no `expectedAt`).
