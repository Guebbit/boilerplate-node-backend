---
source: src/modules/delivery/services/read.ts
sha256: 8c3fdb05125efb2f90e49c51eb32bf530f482ee55d91d7ef230ec6926f509e00
generated_at: 2026-10-14T15:32:32.026438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/read.ts

## Purpose

Read-side service for a delivery order's fulfillment. Answers the order-page `GET /delivery/order/:orderId`, provides narrow reads consumed by `returns` (what has shipped, what a remainder cancel would take), and supplies the two batch sections of the account data export. Ownership of fulfillment orders and shipments is always the order's; the caller's scope is enforced through the order read.

## Key elements

- **`getForOrder(orderId, authContext?)`** — Primary read. Resolves the order (404 if absent), runs `ensureFulfillmentOrders` as a safety net, then fetches fulfillment orders, shipments, a fresh order copy, and standing context in parallel. Returns `{ fulfillmentOrders, shipments }` with per-record actions from `actions.ts`. Unpaid orders yield both lists empty.
- **`shippedQuantities(orderId)`** — Sums `shippedQuantity` across all fulfillment-order lines into a per-product map. Used by `returns` to gate what can be returned.
- **`RemainderOption`** (interface) — Shape of a single remainder-cancel choice: fulfillment order id, number, and the still-unshipped lines with their frozen titles.
- **`remainderOptions(orderId, shipped)`** — Returns remainder options only when `shipped` is true; otherwise resolves to `[]`. Filters to lines where `remainingOfLine > 0`.
- **`findShipmentsForOrders(orderIds)`** / **`findFulfillmentOrdersForOrders(orderIds)`** — Batch reads for the account data export. Short-circuit to `[]` on an empty id list. Explicitly *not* on `deliveryService`; these are the narrow reads a sibling module (account export) may call.
- **`waitHasExpired(fulfillmentOrderId, now?)`** — Re-reads a fulfillment order and checks whether its "keep waiting" window has closed. Returns `false` if the record is missing or no longer `on_hold`. Accepts an injectable `now` for tests.

## Relationships

- **`../repository.ts`** — All data access goes through `fulfillmentOrderRepository` and `shipmentRepository`; no direct DB calls here.
- **`./ensure.ts`** — `getForOrder` calls `ensureFulfillmentOrders` before reading, guaranteeing a paid order has at least one fulfillment order even if the `paid` listener failed.
- **`./actions.ts`** — Provides `standingOn`, `fulfillmentOrderActions`, and `shipmentActions`, which this file attaches to each presented record.
- **`../presenter.ts`** — `presentFulfillmentOrder` and `presentShipment` shape domain documents into the API response.
- **`../domain`** — `hasWaitExpired`, `remainderLines`, `remainingOfLine`, and the `ProductQuantity` type supply the business-logic primitives used by `waitHasExpired`, `remainderOptions`, and `shippedQuantities`.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` wrap every response.
- **`@infrastructure/i18n`** — `t('delivery.order-not-found')` localises the 404 message.
- **`@modules/orders`** — `orderService.getById` with `callerScope` enforces ownership before any delivery data is touched.
- **`services/index.ts`** — Barrel re-export; consumers import from the barrel, not this path directly.
- **Integration tests** (`service.test.ts`, `preorder-late.test.ts`) — Exercise `getForOrder`, `shippedQuantities`, `remainderOptions`, and `waitHasExpired` end-to-end.

## Notes

- The order is re-read *after* `ensureFulfillmentOrders` (`fresh ?? order`) because `ensure` may have mutated status (e.g. created a fulfillment order, advanced state). All downstream presentation uses this fresh copy.
- `findShipmentsForOrders` and `findFulfillmentOrdersForOrders` are deliberately kept off `deliveryService` so that only the account-export flow reaches them; `deliveryService` is reserved for this module's own subscription and admin surface.
- `waitHasExpired` defaults `now` to `new Date()` but accepts an explicit instant—tests inject fixed dates rather than mocking the clock.
- An unpaid order is not an error: both lists simply come back empty. The 404 only fires when the order itself cannot be found within the caller's scope.
