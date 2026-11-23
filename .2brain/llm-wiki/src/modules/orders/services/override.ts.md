---
source: src/modules/orders/services/override.ts
source_sha256: a9b0670efc520dc66c1663dc0e3b2f22209f0d9bea80e8d1925a91a83efcdb3a
context_sha256: 7bd8b0eae39eda1c18e35d322f0bba92e2ae38a7d06f9a88708e219f469e3d64
generated_at: 2026-11-22T06:21:42.596581+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/override.ts

## Purpose
Implements the admin "override" path for order status: `overrideStatus` (`POST /orders/{id}/override-status`). It lets a holder of `override:Order` correct an order's status with no shipped email and no carrier record. The status write, timeline entry, stock leaving the shelf, and events are committed in one transaction. It announces `order.status_overridden` so the `delivery` module can bring its own records in step. `orders` never touches a shipment itself.

## Key elements
- **`overrideStatus(orderId, to, reason, context)`** (exported) loads the order with `findByIdScoped` and returns a `ResponseSuccess<OrderDocument>` or a `ResponseReject`.
  - 404 (`orders.not-found`) if the order is missing.
  - 409 `ORDER_OVERRIDE_NOT_ALLOWED` if `canOverrideTo(order.status, to, isDigitalOnlyOrder(order.items))` is false.
  - 409 `ORDER_OVERRIDE_AWAITING_STOCK` if `shipsAwaitedStock(to, order.fulfillment)` is true.
  - Otherwise calls `applyOverride`. A `null` result (lost race) becomes the same 409 "not allowed".
- **`applyOverride`** (internal) performs the write.
  - Rejects with an `Error` if `context.caller.id` is missing. This is an invariant violation, not a race.
  - For `to === delivered`, computes a delivery clock via `deliveryClockFor(order, at, withdrawalPeriodDays())`, because no `markDelivered` timestamp exists.
  - Wraps `orderRepository.applyStatusOverride(orderId, observedFrom, to, clock, session)` in `withTimeline`, adding a `status_overridden` row with `actor`, `text: reason`, and `data: {mode:'status', from, to}`.
  - Emits `statusChangedEvent` and `statusOverriddenEvent`.
  - On success, calls `recordAudit` with `ORDER_STATUS_OVERRIDDEN`.
- **`notAllowed(from, to)`** (internal) builds the 409 reject with `details: {from, to}`.

## Relationships
- **`../repository`**: `findByIdScoped` for the read and `applyStatusOverride` for the conditional write.
- **`../domain`** (`canOverrideTo`, `isDigitalOnlyOrder`, `deliveryClockFor`, `shipsAwaitedStock`): decides what is legal and computes the delivery clock.
- **`../config`**: supplies `withdrawalPeriodDays`.
- **`./announce`**: provides `statusChangedEvent` and `statusOverriddenEvent`.
- **`@kernel/outbox`**: `announceInTransaction` publishes the events in the same transaction.
- **`./ship-stock`**: `announceMoveShippingStock` handles stock leaving the shelf.
- **`./timeline`**: `withTimeline` writes the history row.
- **`../audit`** and **`@infrastructure/observability/audit`**: the action constant and `recordAudit`.
- **`@infrastructure/http/response`**: `generateSuccess` and `generateReject`.
- **`@infrastructure/i18n`**: `t(...)` for error messages.
- **`../model`**: `OrderDocument` type.

## Notes
- The write is conditional on the order still being at the status that was read. If it moved, `applyOverride` returns `null` and the caller returns a 409, not a 404, because the order still exists.
- Stock handling depends on the target status. `processing` uses plain `announceInTransaction`. Any other target goes through `announceMoveShippingStock`, since overriding past dispatch counts as a dispatch. A hold already `shipped` makes the stock half a no-op.
- Webhooks still fire for overrides, because subscribers only care that the status moved.
- The `reason` must be non-empty, but this file does not check it. The schema layer refuses an empty one.
- Permission (`override:Order`) is enforced by the route's `requirePermission`, not here.
