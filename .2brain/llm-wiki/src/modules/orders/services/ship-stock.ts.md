---
source: src/modules/orders/services/ship-stock.ts
source_sha256: aa096c773343a15e16050ef50b47a2b851491051c07806de91f5e779179bf587
context_sha256: df762d32311c0ddf8aa6ed171575d53e89154874ac6563c289d1439b38f76b64
generated_at: 2026-11-22T06:23:41.861990+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/ship-stock.ts

## Purpose
Implements the stock-taking half of the order status override. When an order is forced forward to `shipped` or `delivered`, any part of the order's inventory hold that hasn't already left is taken off the shelf. It is the whole-remainder counterpart to the per-shipment `shipStock` in `./fulfillment`, which handles ordinary shipments. Stock is decremented when goods leave, not when they are paid for.

## Key elements
- `announceMoveShippingStock(orderId, write, announce)` is the only export. It does the following:
  - Runs the caller's conditional status `write(session)` inside a transaction.
  - If the write returned an order, calls `inventoryService.shipForOrder(orderId, session)` in the same transaction.
  - Announces events through `announceInTransaction`, using `announce(order)` to build the `OutboxAnnouncements<DomainEventName>`.
  - After the commit, calls `inventoryService.forgetAvailabilityForOrder(orderId)`.
  - Returns the updated `OrderDocument`, or `null` if the write matched nothing.

## Relationships
- `src/kernel/outbox.ts`: provides `announceInTransaction` and the `OutboxAnnouncements` type. This supplies the transaction and the event announcement.
- `src/kernel/events.ts`: supplies the `DomainEventName` type that constrains the announcements.
- `src/modules/inventory/index.ts`: exports `inventoryService`, which this file uses to take stock off the shelf in the transaction and to clear the availability entry after commit.
- `src/modules/orders/model.ts`: supplies the `OrderDocument` type.
- `src/modules/orders/services/override.ts` and `src/modules/inventory/services/index.ts` are graph neighbors, but this file does not import from either.

## Notes
- The status write, the stock decrement and the event announcement commit atomically, so an order can't read `shipped` while its units still count as on hand.
- The availability entry lives outside the transaction and can't be rolled back. It is therefore deleted only after the commit lands, and only if the write matched an order.
- If `write` returns `null` (a lost race), no stock moves and no availability cleanup runs.
