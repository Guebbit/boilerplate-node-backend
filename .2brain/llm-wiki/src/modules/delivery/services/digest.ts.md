---
source: src/modules/delivery/services/digest.ts
source_sha256: 33af1c50465aa5dabce2f627e65a588be6beb7e966cd2cedd064670114b91739
context_sha256: 5dde1e148757121344da5ea9768f2f92c8afd6a3a92bf17af1dc5d200f41db7e
generated_at: 2026-11-22T04:54:12.591025+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/digest.ts

## Purpose
Computes the four counts the daily staff digest reads from the delivery module: late preorders, holds open too long, tracked parcels still missing a tracking code, and parcels shipped but never marked arrived. It returns counts only, so the digest holds no shipment data. See `src/modules/shop-tasks/module.ts`.

## Key elements
- `DeliveryDigest` (interface): result shape with `preordersLate`, `holdsOpen`, `awaitingTracking` and `undelivered`, all numbers.
- `DeliveryDigestAllowance` (interface): how long each item may wait before it is counted (`holdDays`, `trackingHours`, `undeliveredDays`).
- `deliveryDigest(now, allowance)`: the exported entry point. It runs four queries in parallel with `Promise.all` and returns a `DeliveryDigest`.
  - **preordersLate:** `fulfillmentOrderRepository.searchBoard({ late: true }, now, { skip: 0, limit: 1 })`, reading `totalItems`.
  - **holdsOpen:** counts fulfillment orders with status `on_hold`, a `holdReason` other than `awaiting_stock`, and `heldAt` older than `holdDays`.
  - **awaitingTracking:** `countAwaitingTracking`, using a cutoff of `now - trackingHours`.
  - **undelivered:** counts physical shipments with status `shipped` and `shippedAt` older than `undeliveredDays`.
- `countAwaitingTracking(cutoff)` (private): finds physical, shipped shipments with no `trackingCode` and `shippedAt <= cutoff`. It fetches the shipping methods for their orders in one call to the orders service, then counts the shipments that pass `isAwaitingTracking`.
- `TRACKING_SCAN_LIMIT` (1000): the most shipments examined for the tracking count.

## Relationships
- `src/modules/delivery/repository.ts`: provides `fulfillmentOrderRepository` (`searchBoard`, `count`) and `shipmentRepository` (`findAll`, `count`).
- `src/modules/delivery/domain` (`index.ts`): provides `isAwaitingTracking`, which decides whether a shipment counts given its order's shipping method.
- `src/modules/orders` (`index.ts`): provides `orderService`, whose shipping-method lookup supplies the method per order id, because the method lives on the order and not on the shipment.
- `src/types`: provides the enums `FulfillmentHoldReason`, `FulfillmentOrderKind`, `FulfillmentOrderStatus` and `ShipmentStatus`.
- `src/domain-primitives/time.ts`: provides `DAY_MS` and `HOUR_MS` for the cutoff arithmetic.

## Notes
- The awaiting-tracking count is capped. At most 1000 candidate shipments are scanned, so with a larger backlog the figure is not exact, as the code comment says.
- Holds with reason `awaiting_stock` are deliberately excluded from `holdsOpen`. The filter takes every `FulfillmentHoldReason` value except that one.
- `preordersLate` reuses the board search (`late: true`) and takes only its total, fetching a page of one item.
- `now` is a parameter and not read from the clock, so all allowances are measured from the same instant.
