---
source: src/modules/orders/tests/integration/ship-stock.test.ts
sha256: 4f0d46ec63bc1ade221f6d345540bd8f6e45b1944c1782bc3899f91ee4afedcc
generated_at: 2026-11-08T07:10:38.145538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/ship-stock.test.ts

## Purpose

Integration tests verifying that stock leaves the shelf (`onHand`) when a shipment is dispatched via `shipStock`, that subsequent status moves (`shipped`, `delivered`) take nothing further, and that an admin override past dispatch takes only the unshipped remainder. Runs against a real MongoDB instance with no service mocking.

## Key elements

- **`paidOrderHolding(status, digital?)`** – Fixture helper: creates a product (10 on hand), seeds an order at the given status, reserves 3 units, and commits the hold. Returns `{ orderId, productId }`.
- **`stillClaimed(orderId)`** – Convenience assertion helper wrapping `inventoryService.isStockBoundToOrder`.
- **`shipRows(productId)`** – Counts `ship`-reason movement rows in the inventory ledger for a product.
- **`describe('paying and processing')`** – Asserts that moving an order to `processing` via `overrideStatus` leaves stock counters and the claim untouched.
- **`describe('shipStock')`** – Three cases: partial ship (1 of 3), full ship (ends the hold, then `markShipped`/`markDelivered` take nothing), and rollback safety (thrown error inside `withTransaction` leaves counters unchanged).
- **`describe('the admin override')`** – Three cases: override directly to `shipped`/`delivered` from `paid`; override `shipped→delivered` does not double-take; override after a partial `shipStock` takes only the remainder (produces a second ledger row).

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the real MongoDB connection for the whole file.
- **`tests/support/callers.ts`** – `callerContextAs('admin', 'admin-1')` supplies the admin identity required by `overrideStatus`.
- **`src/modules/orders/tests/factories.ts`** – `seedOrder`, `seedDigitalOrder` create order documents at a given status.
- **`src/modules/products/tests/factories.ts`** – `createProduct({ onHand })` seeds inventory; `countersOf(productId)` reads back `{ onHand, reserved, available }` for assertions.
- **`src/modules/inventory/index.ts`** – `inventoryService` provides `reserveForOrder`, `commitForOrder`, `isStockBoundToOrder`, `shipForOrder`, and `listMovements`.
- **`src/types/index.ts`** – `OrderStatus` and `StockMovementReason` enums used throughout.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction(session => …)` wraps `shipStock` calls so the test can verify rollback isolation.
- **`src/modules/orders/services/fulfillment.ts`** – `shipStock` (primary SUT) and `refreshShelf` (post-commit cache bust).
- **`src/modules/orders/services/status.ts`** – `markShipped`, `markDelivered` exercised to confirm they perform no stock movement.
- **`src/modules/orders/services/override.ts`** – `overrideStatus` exercised as the admin path that dispatches its own stock take.

## Notes

- Despite `jest.restoreAllMocks()` in `afterEach`, no mocks are actually set up in these tests; the call is likely a defensive convention carried from other test files.
- `refreshShelf` is invoked **after** the transaction commits because the catalogue cache cannot be rolled back with the session.
- The full-ship test asserts exactly **one** `ship` ledger row even though `markShipped`/`markDelivered` follow, confirming those status moves do not write their own movement.
- The "no double-take" override test calls `inventoryService.shipForOrder` explicitly before the override, simulating the state where stock was already removed by a prior `shipStock` path.
