---
source: src/modules/delivery/services/override-sync.ts
generated_at: 2026-11-22T04:56:35.606388+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/override-sync.ts

## Purpose
Listener-side logic that keeps fulfillment records consistent after an admin manually overrides an order's status. When `orders` announces `order.status_overridden`, this file ships (and for `delivered`, also delivers) whatever remains on the order's fulfillment orders, all stamped with the override's own instant. The shipments it creates are silent: no stock taken, no email, no webhook ("no parcel, no email"). The module header points to a `docs/modules/delivery.md#the-status-override` reference.

## Key elements
- `syncWithOverride(orderId, to, at)` — the only export. Returns immediately for any status other than `shipped` or `delivered`. Otherwise, in one act (`runActOrThrow`), it:
  1. loads the order's fulfillment orders,
  2. runs `shipRemainder` on each, sequentially,
  3. if `to` is `delivered`, runs `deliverOutstanding`,
  4. calls `reportProgress(orderId, session)`.
- `shipRemainder` (internal) — if a fulfillment order has remaining quantity (`remainingOf(...) !== 0`), cuts a shipment via `cutShipment` with `remainderLines`, `forced: true`, `takeStock: false`, `delivered` set when `to` is `delivered`, and `at` as the instant. It does nothing if nothing remains.
- `deliverOutstanding` (internal) — finds the order's shipments and calls `markDelivered` at `at` for each one whose status is `'shipped'`.

## Relationships
- `../domain` — supplies `remainingOf` and `remainderLines`, which decide what is left to ship.
- `../repository` — provides `fulfillmentOrderRepository` and `shipmentRepository`, used to load the order's fulfillment orders and shipments and to mark shipments delivered, all with the act's session.
- `../model` — `FulfillmentOrderDocument` type for the snapshot passed to `shipRemainder`.
- `./act` — `runActOrThrow` provides the transactional session and throws on refusal.
- `./cut` — `cutShipment` creates the forced shipment.
- `./progress` — `reportProgress` rewrites the order's progress summary at the end.
- `@types` — `OrderStatus` enum.

## Notes
- Idempotent: a redelivered event finds nothing remaining and nothing out, and rewrites the same summary.
- Throws `ActRefusal` if a fulfillment order can't ship its remainder (it changed since the override was recorded). The outbox retries, and a dead event alerts staff.
- Operations run in sequence on purpose, because a transaction session doesn't support parallel operations.
- The `at` instant is the same one `withdrawUntil` was counted from.
