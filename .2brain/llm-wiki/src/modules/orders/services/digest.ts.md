---
source: src/modules/orders/services/digest.ts
source_sha256: dfa5db7cb61b326ace6402a96b346947dc725861af5459b2a8a7bd369707a9c9
context_sha256: e96b416dad3f97db60464ce310c5acecfd94f25ea2a15f69b5b0cd677f943893
generated_at: 2026-11-22T06:20:01.623588+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/digest.ts

## Purpose
Computes the two order-side figures for the daily staff digest: bank transfers about to lapse and paid orders that have not shipped. It returns counts only, so the digest holds no order data. It also provides a helper to look up the shipping method each order froze at checkout.

## Key elements
- `OrdersDigest` – interface with `transfersDue` and `unshipped` counts.
- `ordersDigest(now, { transferHours, unshippedDays })` – runs two `orderRepository.count` queries in parallel and resolves to an `OrdersDigest`:
  - `transfersDue`: orders with status `pending`, payment method `bank_transfer`, `deletedAt: null`, and `payBy` at or before `now + transferHours`. This includes `payBy` dates already past.
  - `unshipped`: orders matching `fulfillmentStatusFilter('awaiting_shipment')`, not deleted, with `paidAt` at or before `now - unshippedDays`.
- `shippingMethodsOf(orderIds)` – returns a `Map` from order id (as a string) to the order's `shippingMethod`. The method is `undefined` if the order froze none. An empty input returns an empty map without querying.

## Relationships
- `src/domain-primitives/time.ts` – supplies `HOUR_MS` and `DAY_MS` for the window arithmetic.
- `src/modules/orders/domain/fulfillment.ts` – supplies `fulfillmentStatusFilter`. The `unshipped` count uses it so it matches the set opened by the digest link (`fulfillmentStatus=awaiting_shipment`).
- `src/modules/orders/repository.ts` – supplies `orderRepository`, which is used for `count` and `findByIds`.
- `src/modules/orders/services/index.ts` – a sibling in the services directory. The file content does not show how it uses this module.

## Notes
- `now` is passed in rather than read from the clock, so the windows are measured from a caller-supplied instant.
- Both counts exclude soft-deleted orders (`deletedAt: null`).
- The module header points to the staff-digest section of the shop-tasks documentation; the related code lives in `src/modules/shop-tasks/module.ts`.
