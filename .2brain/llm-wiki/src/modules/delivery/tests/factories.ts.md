---
source: src/modules/delivery/tests/factories.ts
sha256: 9abd73d94f4254e1505383f473050632fc01b5aba8e9657a641233900fc66d2b
generated_at: 2026-10-29T03:45:23.477307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/factories.ts

## Purpose

Test factory helpers for the delivery module that advance an order through shipping and delivery **via the module's own service methods** (the "doors"), so fulfillment orders, shipments, status transitions, and inventory all stay consistent. A smaller set of helpers writes directly to the model for time-dependent states that no service call can produce. Also provides one-shot setup for paid preorder and backorder orders with inventory reserved and committed.

## Key elements

- **`ShipEverythingOptions`** — optional `trackingCode`, `forced` (ship from `paid` without `start`), and `reason`.
- **`fulfillmentOrdersOf(orderId)`** — ensures fulfillment orders exist via `deliveryService.ensureFulfillmentOrders`, then reads them from the repository.
- **`setFulfillmentOrderState(id, fields)`** — direct Mongoose write of `agreedAt` / `expectedAt` / `lastNoticeAt` / `dueNoticeFor` (time-only states).
- **`setFirstLineShipped(id, qty)`** — direct Mongoose write of `lines.0.shippedQuantity` (re-send refusal scenarios).
- **`shipmentsOf(orderId)`** — reads all shipments for the order from `shipmentRepository`.
- **`shipEverything(orderId, options?)`** — ships every `physical` + `open` fulfillment order as admin; throws on failure.
- **`deliverEverything(orderId)`** — delivers every shipment still in `shipped` status as admin; throws on failure.
- **`carryOrderTo(orderId, 'shipped' | 'delivered')`** — convenience: force `processing` → `shipEverything` → (optionally) `deliverEverything`.
- **`WantedPreorder` / `paidPreorderOrder(wanted, buyer?, shippingAddress?)`** — creates a PAID order of preorder lines with zero stock, sets per-product backorder limits, reserves and commits inventory. Returns `{ user, orderId, productIds }`.
- **`WantedBackorder` / `paidBackorderOrder(wanted, buyer?)`** — creates a PAID order of one released product with partial stock, spills the owed portion, sets an uncapped backorder limit, reserves and commits. Returns `{ user, orderId, productId }`.
- **`backdateShipments(daysAgo)`** — direct Mongoose `updateMany` of `shippedAt` on **all** shipments (no order filter) to simulate elapsed time.

## Relationships

- **`src/modules/delivery/services/index.ts`** — primary door; `fulfillmentOrdersOf`, `shipEverything`, and `deliverEverything` all call `deliveryService` methods.
- **`src/modules/delivery/repository.ts`** — read path for `fulfillmentOrdersOf` and `shipmentsOf`.
- **`src/modules/delivery/model.ts`** — direct-write path for `setFulfillmentOrderState`, `setFirstLineShipped`, and `backdateShipments` (bypasses the service).
- **Integration tests** (`preorder`, `preorder-late`, `preorder-board`, `backorder`, `destination`, `lost-parcel`, `order-status-races`, `override-sync`, `release-date-impact`, `retention`) and **contract tests** (`api.contract.test.ts`) — consume these factories to set up and advance orders.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — cross-module consumer of these delivery factories.

## Notes

- `shipEverything` silently skips non-`physical` or non-`open` fulfillment orders; it will not raise if none qualify.
- `backdateShipments` has **no order filter** — it rewrites `shippedAt` on every shipment in the database. Use in isolation or with a clean test fixture.
- `paidPreorderOrder` and `paidBackorderOrder` create a fresh user when passed a string email; pass an existing `UserDocument` to reuse an account (e.g., the logged-in test user).
- The "door" convention: prefer service-method calls for state transitions; the three direct-model writes exist only because those states are reachable solely by the passage of time.
