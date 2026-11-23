---
source: src/modules/orders/tests/integration/ship-stock.test.ts
source_sha256: d2df1be73adc348721e2c293bd2a0550b78cb33128de164d84af6ae4eef65059
context_sha256: 16c5c25486569c0eef073dc4e7ad310bebe80c5073738442b257c88bd8aee1ce
generated_at: 2026-11-22T06:34:03.268410+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/ship-stock.test.ts

## Purpose
Integration tests, run against a real Mongo database, for when stock actually leaves the shelf. They check that a shipment (`shipStock`) takes its own units off `onHand` in its own transaction, that status moves (`markShipped`, `markDelivered`) only report the fact and take nothing, and that the admin override is the one status move that dispatches stock itself, taking whatever has not yet left.

## Key elements
- `setupTestDb()` and `afterEach(jest.restoreAllMocks)` set up the DB and mock cleanup.
- `paidOrderHolding(status, digital?)` is a helper. It creates a product with `onHand: 10` and seeds an order in the given status, either digital-only or regular. It then reserves 3 units and commits them, which is the starting state for every dispatch. It returns `{ orderId, productId }`.
- `stillClaimed(orderId)` wraps `inventoryService.isStockBoundToOrder`. It is true while the hold is held or committed, and false after it ships or is released.
- `shipRows(productId)` counts the `StockMovementReason.ship` ledger rows for a product via `inventoryService.listMovements`.
- `describe('paying and processing')`: an admin override to `processing` leaves the counters at `{ onHand: 10, reserved: 3, available: 7 }` and the order still claimed.
- `describe('shipStock')` has three cases:
  - A partial shipment of 1 unit gives `{ 9, 2, 7 }`, keeps the hold, and writes 1 ship row.
  - Shipping all 3 units ends the hold. A following `markShipped` and `markDelivered` take nothing more, leaving `{ 7, 0, 7 }` and still 1 ship row.
  - If the caller's transaction throws after `shipStock`, nothing moves and the hold stays.
- `describe('the admin override')` has three cases:
  - An override from paid to `shipped` or `delivered` (via `it.each`) takes all 3 units off the shelf.
  - Overriding a shipped order (already shipped via `inventoryService.shipForOrder`) to `delivered` does not take the units twice, leaving 1 ship row.
  - After 1 unit has shipped in a shipment, an override to `shipped` takes only the remaining units, leaving `{ 7, 0, 7 }` and 2 ship rows.

## Relationships
- `tests/support/setup-test-db.ts` supplies `setupTestDb`.
- `tests/support/callers.ts` supplies `callerContextAs('admin', 'admin-1')` for the override calls.
- `src/modules/orders/tests/factories.ts` supplies `seedOrder` and `seedDigitalOrder`.
- `src/modules/products/tests/factories.ts` supplies `createProduct` and `countersOf`.
- `src/modules/inventory/index.ts` supplies `inventoryService`, used for `reserveForOrder`, `commitForOrder`, `shipForOrder`, `isStockBoundToOrder` and `listMovements`.
- `src/modules/orders/services/fulfillment.ts` supplies `shipStock` and `refreshShelf`.
- `src/modules/orders/services/status.ts` supplies `markShipped` and `markDelivered`.
- `src/modules/orders/services/override.ts` supplies `overrideStatus`.
- `src/infrastructure/runtime/database.ts` supplies `withTransaction`, which wraps `shipStock` calls.
- `src/types/index.ts` supplies `OrderStatus` and `StockMovementReason`.
- `src/modules/inventory/services/index.ts` is a neighbor, but the file does not import it directly. It reaches inventory through `@modules/inventory`.

## Notes
- `shipStock` is called with a `session` inside `withTransaction`. A code comment says the availability entry cannot roll back, so the tests call `refreshShelf([productId])` after the commit to delete it.
- The counters in `countersOf` assertions read as `{ onHand, reserved, available }`.
- The tests use `jest.restoreAllMocks`, but this file sets up no mocks itself.
