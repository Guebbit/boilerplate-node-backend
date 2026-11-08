---
source: src/modules/delivery/tests/factories.ts
sha256: 767bebc823890599485768ec9f0cfd5a97e68ed8592260a93f951668c3bf91c1
generated_at: 2026-11-08T05:41:26.661795+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/factories.ts

## Purpose

Test factories that drive an order through the delivery module's public service doors (`deliveryService`) so integration and contract tests get a fully consistent set of fulfillment orders, shipments, summaries, and status transitions — without manually assembling each document. Also provides a few targeted "backdate" helpers that mutate dates or quantities directly via the model, since no service door exposes that kind of time-travel.

## Key elements

- **`fulfillmentOrdersOf(orderId)`** — Calls `deliveryService.ensureFulfillmentOrders` then returns the documents from the repository. Idempotent: safe to call when orders already exist.
- **`setFulfillmentOrderState(id, fields)`** — Raw model update for `agreedAt`, `expectedAt`, `lastNoticeAt`, `dueNoticeFor`. Use when a test needs a promise date in the past or a notice already sent.
- **`setFirstLineShipped(id, qty)`** — Sets `lines.0.shippedQuantity` on a fulfillment order to simulate a partial ship.
- **`shipmentsOf(orderId)`** — Returns all shipments for the order via `shipmentRepository`.
- **`shipEverything(orderId, options?)`** — Iterates every `physical` / `open` fulfillment order and calls `deliveryService.shipFulfillmentOrder` as admin. Throws on the first failure.
- **`deliverEverything(orderId)`** — Iterates every `shipped` shipment and calls `deliveryService.deliverShipment` as admin.
- **`carryOrderTo(orderId, 'shipped' | 'delivered')`** — Composite: forces order to `processing`, ships everything (tracking `TRK-CARRIED01`), optionally delivers everything. The standard "get me to this state" helper.
- **`paidPreorderOrder(wanted, buyer?, shippingAddress?)`** — Creates a PAID order whose lines are all backorder-preorder (product `onHand: 0`, `releaseDate` set). Reserves and commits inventory. Returns `{ user, orderId, productIds }`.
- **`paidBackorderOrder(wanted, buyer?)`** — Creates a PAID order for one backorder-enabled product with partial shelf stock; the owed portion is frozen with a promise date. Returns `{ user, orderId, productId }`.
- **`backdateShipments(daysAgo)`** — `updateMany({})` on `shipmentModel` setting `shippedAt` to N days ago. **Unscoped** — hits every shipment in the collection.

## Relationships

- **`src/modules/delivery/services/index.ts`** — Primary door: `deliveryService` is called by `shipEverything`, `deliverEverything`, and `fulfillmentOrdersOf`.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository` and `shipmentRepository` are used for read-back after service calls.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel` and `shipmentModel` are used by the backdate/state helpers (`setFulfillmentOrderState`, `setFirstLineShipped`, `backdateShipments`); types `FulfillmentOrderDocument` / `ShipmentDocument` shape return values.
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant used to compute the backdated timestamp in `backdateShipments`.
- **Integration tests** (`backorder.test.ts`, `destination.test.ts`, `lost-parcel.test.ts`, `order-status-races.test.ts`, `override-sync.test.ts`, `preorder-board.test.ts`, `preorder-late.test.ts`, `preorder.test.ts`, `release-date-impact.test.ts`) and **`api.contract.test.ts`** — downstream consumers that import these factories to set up preconditions.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — consumer; likely calls `paidBackorderOrder` / `paidPreorderOrder` for shop-level contract scenarios.

## Notes

- `backdateShipments` is **not scoped to an order** — it rewrites `shippedAt` on every shipment document in the collection. Run it in a test suite that has cleaned or isolated its DB, or the shared timestamps will leak.
- `shipEverything` silently skips non-`physical` or non-`open` fulfillment orders; it will not throw if there are none to ship (returns `[]`).
- `carryOrderTo` hard-codes the tracking code `TRK-CARRIED01`; tests that assert on a specific tracking value should call `shipEverything` directly with their own code.
- `paidPreorderOrder` and `paidBackorderOrder` do **not** create fulfillment orders — they only exist in the ledger. A subsequent call to `fulfillmentOrdersOf` (or any service read) materialises them.
- The `buyer` parameter in both paid-order helpers accepts either an email string (a new user is created) or an existing `UserDocument`; pass a distinct email when a test creates multiple orders to avoid address collisions.
