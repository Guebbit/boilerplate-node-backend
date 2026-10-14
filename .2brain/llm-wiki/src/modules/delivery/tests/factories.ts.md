---
source: src/modules/delivery/tests/factories.ts
sha256: 753d14d9ca0ba646555f155cea4fe5bab91296b3c78caf6633ee96bdee752ef7
generated_at: 2026-10-14T15:35:50.922796+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/factories.ts

## Purpose

Test factories for the delivery module. They drive an order through the module's own service layer (`ensureFulfillmentOrders`, `shipFulfillmentOrder`, `deliverShipment`) so that the resulting database state — fulfillment orders, shipments, status transitions, and inventory — matches what a real staff action would produce. Used by integration and unit tests that need "a shipped order" or "a delivered order" without hand-rolling the records.

## Key elements

- **`ShipEverythingOptions`** — options bag for `shipEverything`: optional `trackingCode`, `forced` flag (ship from `paid` without `start`), and `reason`.
- **`fulfillmentOrdersOf(orderId)`** — ensures fulfillment orders exist (calls `ensureFulfillmentOrders`) then returns them from the repository.
- **`shipmentsOf(orderId)`** — reads the order's shipments from `shipmentRepository` in creation order.
- **`shipEverything(orderId, options?)`** — iterates the order's physical, open fulfillment orders and calls `shipFulfillmentOrder` as admin; returns the resulting `Shipment[]`.
- **`deliverEverything(orderId)`** — iterates the order's `shipped` shipments and calls `deliverShipment` as admin; returns the delivered `Shipment[]`.
- **`carryOrderTo(orderId, 'shipped' | 'delivered')`** — one-call shortcut: forces status to `processing`, ships everything (with a fixed tracking code), and optionally delivers everything.
- **`createShipmentFor(orderId)`** — bypasses the service layer entirely; writes a `Shipped` shipment directly via `shipmentRepository.create`. Intended for tests that need a shipment to *reference* (rank checks, route tables) rather than one that was produced by shipping.
- **`WantedPreorder`** — shape for a preorder line: `quantity` + `releaseDate`.
- **`paidPreorderOrder(wanted, buyer?)`** — creates a user (or reuses one), creates products with zero stock and the given release dates, creates a `paid` order, sets preorder inventory limits, reserves, and commits inventory. Returns `{ user, orderId, productIds }`. No fulfillment orders or shipments exist until something reads them.

## Relationships

- **`../services` (index, `ensure.ts`, `ship.ts`, `deliver.ts`)** — the factory calls the public service functions (`ensureFulfillmentOrders`, `shipFulfillmentOrder`, `deliverShipment`) as its primary mechanism for producing state.
- **`../repository.ts`** — reads back fulfillment orders and shipments; `createShipmentFor` writes directly through `shipmentRepository.create`.
- **`../model.ts`** — provides the `FulfillmentOrderDocument` and `ShipmentDocument` types used in return signatures.
- **`@modules/orders/tests/factories`** — uses `createOrder`, `forceOrderStatus`, `toOrderItem`.
- **`@modules/users/tests/factories`** — uses `createUser`.
- **`@modules/products/tests/factories`** — uses `createProduct`.
- **`@modules/inventory`** — `paidPreorderOrder` calls `inventoryService.setPreorderLimit`, `reserveForOrder`, `commitForOrder`.
- **`@tests/callers`** — provides `asAdmin` and `callerContextAs` for the caller context passed to service calls.
- **Test files** (`api.contract.test.ts`, `preorder*.test.ts`, `override-sync.test.ts`, `retention.test.ts`, `service.test.ts`, `timeline.test.ts`, `fulfillment.test.ts`) — import and use the factory helpers to set up their preconditions.

## Notes

- `carryOrderTo` uses a hardcoded tracking code (`TRK-CARRIED01`); all shipments it produces share it.
- `createShipmentFor` deliberately skips the service layer (no rank rules, no stock deduction, no status transition). Use it only when the test's assertion target is the shipment record itself, not the side-effects of shipping.
- `paidPreorderOrder` leaves the order at `paid` with no fulfillment orders yet; the first call to `fulfillmentOrdersOf` (or any service that calls `ensureFulfillmentOrders`) materializes them.
- The `forced` option on `shipEverything` lets a test ship an order still at `paid` (override-holder path) without first moving it to `processing`.
