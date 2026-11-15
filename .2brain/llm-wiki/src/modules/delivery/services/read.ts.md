---
source: src/modules/delivery/services/read.ts
sha256: 70fde40f746319ed406c71d3c480d81a0ba268ccbd6bd8dec4990b364df669fd
generated_at: 2026-11-14T19:49:42.913723+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/read.ts

## Purpose

Read-only service functions for a delivery order's fulfillment data. It serves three consumers: the order page's fulfillment/shipment listings, the `returns` module's narrow queries (what has shipped, what a remainder cancel would remove), and the account export's two data sections. Ownership is always the order's, resolved through `orderService.callerScope`.

## Key elements

- **`listFulfillmentOrdersForOrder`** — Returns all fulfillment orders for an order, each enriched with its `actions` via `presentFulfillmentOrder`. Empty array (not 404) when none exist yet.
- **`listShipmentsForOrder`** — Returns all shipments for an order, each enriched via `presentShipmentFor`. Resolves `restorableIds` in one pass for the lost-parcel `deliver` flag.
- **`orderIdOfFulfillmentOrder`** — Unscoped lookup of the parent order's id from a fulfillment order id. Returns `undefined` if not found. Used by notices that must name the order regardless of reader scope.
- **`getShipment`** — Single shipment by id, scoped through the parent order. Missing or unseen both return 404.
- **`getFulfillmentOrder`** — Single fulfillment order by id, scoped through the parent order. Missing or unseen both return 404.
- **`shippedQuantities`** — Sums `shippedQuantity` per product across all fulfillment orders of an order. Used by `returns` to gate what can be returned.
- **`RemainderOption`** (interface) — Shape for a fulfillable-remainder entry: id, number, and remaining per-product lines with frozen title.
- **`remainderOptions`** — Lists fulfillment orders that still have cancellable units. Before shipping, a group is cancellable only if another group stays live; after shipping, every group with remaining lines qualifies.
- **`findShipmentsForOrders`** / **`findFulfillmentOrdersForOrders`** — Batch document-level lookups for the account export. Return raw documents (not presenters) and short-circuit on empty input.

## Relationships

- **`src/modules/orders/index.ts`** — Every scoped read resolves the caller's access via `orderService.getById(orderId, orderService.callerScope(authContext))`. This is the sole authorization gate in the file.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository` and `shipmentRepository` provide the actual data fetches (`findByOrderId`, `findById`, `findByOrderIds`).
- **`src/modules/delivery/services/actions.ts`** — `standingOn` derives the caller's standing; `fulfillmentOrderActions`, `presentShipmentFor`, and `viewFulfillmentOrder` build the action lists and final view objects.
- **`src/modules/delivery/services/found.ts`** — `restorableIds` computes which lost shipments can be redelivered; `viewShipmentOf` assembles the single-shipment view.
- **`src/modules/delivery/presenter.ts`** — `presentFulfillmentOrder` shapes the fulfillment-order response.
- **`src/modules/delivery/domain/index.ts` / `src/modules/delivery/domain/fulfillment.ts`** — `remainderLines` and `remainingOfLine` determine which lines still have cancellable units; `ProductQuantity` is the shared type for `shippedQuantities`.
- **`src/modules/delivery/model.ts`** — `FulfillmentOrderDocument` / `ShipmentDocument` are the raw repository return types used by the export functions.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` wrap all return values.
- **`src/infrastructure/i18n/index.ts` / `src/infrastructure/i18n/context.ts`** — `t` localizes the 404 messages.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`, `lost.test.ts`, `reship.test.ts`** — Exercise the domain helpers (`remainderLines`, `remainingOfLine`) that `remainderOptions` depends on.

## Notes

- **404 unification**: `getShipment` and `getFulfillmentOrder` return the *same* 404 message whether the record doesn't exist or the caller lacks scope. This is deliberate—do not add a separate 403 path.
- **Empty ≠ 404 for lists**: `listFulfillmentOrdersForOrder` returns `[]` when the order exists but has no fulfillment orders yet. Only a missing *order* is a 404.
- **`remainderOptions` early-exit**: Before anything has shipped, a single live group is *not* a remainder (the whole order must be canceled as an order). The `shipped` boolean from `order.fulfillment.shipped` controls this.
- **Export functions bypass the service handle**: `findShipmentsForOrders` and `findFulfillmentOrdersForOrders` return raw documents rather than presenter-shaped objects. They are the sanctioned exception to the "go through `deliveryService`" rule, existing so the account export can batch-read without triggering per-record action computation.
- **`orderIdOfFulfillmentOrder` is unscoped** by design—it exists for system notices (e.g., emails) that must name the order regardless of the reader's permissions.
