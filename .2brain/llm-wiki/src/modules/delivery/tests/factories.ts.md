---
source: src/modules/delivery/tests/factories.ts
sha256: 667d8121c82b2f92627006df6b1f42945c30a162003795a6025980a91fb94816
generated_at: 2026-11-14T19:52:04.884751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/factories.ts

## Purpose

Test factories for the delivery module that drive an order through shipping and delivery using the module's own service API (the "doors"), so test fixtures carry the same fulfillment orders, shipments, summaries, and status transitions a real order would. A few helpers bypass the service to set clock-dependent state (dates, shipped quantities) that no public action can reach.

## Key elements

- **`ShipEverythingOptions`** — options bag for `shipEverything` (tracking code, forced flag, reason).
- **`fulfillmentOrdersOf(orderId)`** — ensures fulfillment orders exist (via `deliveryService.ensureFulfillmentOrders`) then returns them from the repository.
- **`setFulfillmentOrderState(id, fields)`** — direct `fulfillmentOrderModel.updateOne` to set `agreedAt`, `expectedAt`, `lastNoticeAt`, or `dueNoticeFor`.
- **`setFirstLineShipped(id, qty)`** — direct model write to set `lines.0.shippedQuantity` for re-send-refusal tests.
- **`shipmentsOf(orderId)`** — returns the order's shipments via `shipmentRepository`.
- **`shipEverything(orderId, options?)`** — ships every open physical fulfillment order in full as admin; returns the array of `Shipment` results.
- **`deliverEverything(orderId)`** — delivers every shipment still in `shipped` status as admin.
- **`carryOrderTo(orderId, 'shipped' | 'delivered')`** — composite: forces `processing`, ships everything (tracking `TRK-CARRIED01`), optionally delivers.
- **`WantedPreorder`** / **`paidPreorderOrder(wanted, buyer?, shippingAddress?)`** — creates a PAID order of preorder lines: zero-stock products with a future `releaseDate`, backorder limits set, inventory reserved and committed. Returns `{ user, orderId, productIds }`.
- **`WantedBackorder`** / **`paidBackorderOrder(wanted, buyer?)`** — creates a PAID order of one released product with partial shelf stock and an owed (backorder) line with a promise date. Returns `{ user, orderId, productId }`.
- **`backdateShipments(daysAgo)`** — `shipmentModel.updateMany` to rewrite every shipment's `shippedAt` to N days ago.

## Relationships

- **`src/modules/delivery/services/index.ts`** — this file calls the delivery service for `ensureFulfillmentOrders`, `shipFulfillmentOrder`, and `deliverShipment`; it is the primary consumer of that service in tests.
- **`src/modules/delivery/repository.ts`** — reads fulfillment orders and shipments via `fulfillmentOrderRepository` and `shipmentRepository`.
- **`src/modules/delivery/model.ts`** — direct writes through `fulfillmentOrderModel` and `shipmentModel` for clock/quantity state unreachable via the service; also supplies the `FulfillmentOrderDocument` and `ShipmentDocument` type imports.
- **`src/domain-primitives/time.ts`** — imports `DAY_MS` for the `backdateShipments` calculation.
- **`src/modules/delivery/tests/contract/api.contract.test.ts`** — contract test that consumes these factories to set up delivery state.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — cross-module contract test that uses these factories.
- **`src/modules/delivery/tests/integration/backorder.test.ts`**, **`destination.test.ts`**, **`lost-parcel.test.ts`**, **`order-status-races.test.ts`**, **`override-sync.test.ts`**, **`preorder-board.test.ts`**, **`preorder-late.test.ts`**, **`preorder.test.ts`**, **`release-date-impact.test.ts`** — integration tests that call `carryOrderTo`, `paidPreorderOrder`, `paidBackorderOrder`, `shipEverything`, `deliverEverything`, `backdateShipments`, and the direct-set helpers to arrange pre-conditions.

## Notes

- The file's stated convention is "writes past nothing: each helper is the staff action, repeated." The three direct model writes (`setFulfillmentOrderState`, `setFirstLineShipped`, `backdateShipments`) are the acknowledged exceptions — they exist because the clock-dependent state they set has no service door.
- `shipEverything` skips non-physical or non-`open` fulfillment orders silently; it does not throw for them.
- `carryOrderTo` always uses the hardcoded tracking code `TRK-CARRIED01`; call `shipEverything` directly if a test needs a different code.
- `paidPreorderOrder` and `paidBackorderOrder` leave no fulfillment order in the database; one is created lazily the first time `fulfillmentOrdersOf` is called.
- All service calls authenticate as admin via `asAdmin()` / `callerContextAs('admin')`; no buyer-scoped delivery actions are exercised here.
