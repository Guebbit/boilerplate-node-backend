---
source: src/modules/returns/tests/integration/lost-parcel.test.ts
sha256: 9871a6d46677d15c486b6384b6735d0be8d9d15693691d8f2d00ec3660ec416f
generated_at: 2026-10-29T05:47:16.176850+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/lost-parcel.test.ts

## Purpose

Integration tests for the buyer's remedies when a parcel is lost in transit: the units remain cancellable (refunded, stock restored), goods that never arrived cannot be returned, and a replacement shipment's quantity is capped at what was originally bought. Runs against a real database with the `fake` payment provider.

## Key elements

- **`shippedParcel`** – Full checkout fixture: creates a user, two products (2 × Shirt @ 30, 1 × Mug @ 10, + 5 shipping = 75), reserves stock, creates and confirms a card payment, forces the order to `processing`, and ships in one parcel. Returns all IDs and entity references.
- **`lose`** – Calls `deliveryService.markShipmentLost` with admin context to simulate the carrier reporting loss.
- **`refundsOf`** – Reads the order's refund ledger via `paymentService.getForOrder` and returns `{ reason, amount }` pairs.
- **`cancelRemainder`** – Calls `returnService.createReturn` with `kind: 'cancellation'` as the buyer.
- **`describe('cancelling what a lost parcel carried')`** – Asserts the 75 refund, stock counters reset to `onHand: 8/9, reserved: 0`, and exactly one refund row.
- **`describe('settling an order whose every parcel was lost and refunded')`** – Asserts final order state (`cancelled`, `paymentStatus: refunded`, no `withdrawUntil`/`conformityUntil`), timeline contains one `shipped` row and no `delivered` row, a single system-`cancelled` row with `cause: 'lost'`, reservation released. Also verifies a late `deliverShipment` returns `DELIVERY_NOT_DELIVERABLE`, and that a second (arrived) parcel keeps the order in `delivered` state.
- **`describe('returning goods after a loss')`** – Verifies `shippedQuantities` is empty while the parcel is lost (so a normal return is rejected), and that shipping a replacement does not double the shipped quantity.

## Relationships

- **`src/modules/returns/module.ts` / `src/modules/returns/services/index.ts`** – Registers `returnsModule` in the checkout container; calls `returnService.createReturn` for cancellation and return attempts.
- **`src/modules/delivery/index.ts`** – Drives the delivery lifecycle: `shipFulfillmentOrder`, `markShipmentLost`, `deliverShipment`, `getShipment`, `shippedQuantities`.
- **`src/modules/delivery/tests/factories.ts`** – Reads `fulfillmentOrdersOf` and `shipmentsOf` to obtain IDs and statuses.
- **`src/modules/inventory/index.ts`** – Calls `inventoryService.reserveForOrder` during fixture setup.
- **`src/modules/inventory/tests/factories.ts`** – Imports `reservationRepository` to assert reservation status after settlement.
- **`src/modules/inventory/repository.ts`** – `reservationRepository.findByOrderId` used in the settle test.
- **`src/modules/payments/module.ts`** – Registered alongside `returnsModule` in `registerCheckoutModules`.
- **`src/modules/payments/index.ts`** – `paymentService` used for intent creation, payment confirmation, and refund lookup.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `forceOrderStatus`, `readOrder`, `timelineOf`, `toOrderItem` for order setup and assertions.
- **`src/modules/products/tests/factories.ts`** – `createProduct` and `countersOf` (on-hand / reserved / available assertions).
- **`src/kernel/events.ts`** – `resetDomainEvents()` called in `afterEach` to prevent event leakage between tests.

## Notes

- Uses a **real database** (`setupTestDb`) and the **real `fake` payment provider** — no service mocks; assertions read actual rows (stock counters, timeline, reservation, refund ledger).
- The module-level `customers` counter ensures unique emails across test runs within a single process; it is not reset between tests.
- The `shippedParcel` helper throws if any step (intent, confirm, ship) fails, so a broken precondition surfaces as a fixture error rather than a confusing assertion.
- Business spec lives at `docs/modules/delivery.md#lost-in-transit` (referenced in the file JSDoc).
- The "replacement counted once" test depends on `shippedQuantities` returning the *original* bought quantity, not the sum across lost + replacement shipments.
