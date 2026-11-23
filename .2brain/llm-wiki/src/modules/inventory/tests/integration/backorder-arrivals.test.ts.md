---
source: src/modules/inventory/tests/integration/backorder-arrivals.test.ts
source_sha256: 039e51adff8677ef6fa1d1c28413f6621684e741dfac5bdcb5bc06ce15a4c040
context_sha256: 18b2014287b01616c7f294ed92701d5951288f28f623105c250661fdf49c0faa
generated_at: 2026-11-22T05:25:34.360286+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/backorder-arrivals.test.ts

## Purpose
Integration tests verifying that whenever a unit becomes sellable, the paid buyers waiting on a backorder are served first, in the same transaction. This covers every write path that frees stock, not just receipts: stocktake adjustments, returned parcels, expired or canceled holds, and partial shipment cancellations. The module doc points to `src/modules/inventory/services/transition.ts` (anchor `#preorders`) for the underlying rules.

## Key elements
- `setupTestDb()`: called at module level to prepare the test database.
- `anOrderId()`: returns a unique 24-character hex-style order id (padded with `e`) from a module-level counter.
- `levelOf(productId)`: reads the stock level and returns `{ onHand, reserved, available, backordered }`.
- `itemsOf(orderId)`: returns the `{ quantity, kind }` items on an order's reservation (hold).
- `soldOutWithAPaidBuyerWaiting(shelf)`: fixture. It creates a product with `shelf` units on hand and sets a backorder limit of 5. A `holder` order reserves all shelf units, so none is sellable. A `waiting` order reserves one unit with `kind: 'backorder'` and commits it. It returns `{ productId, holder, waiting }`.
- `describe('a unit that becomes sellable')`, with one test per trigger. In each test, the waiting buyer's item flips to `kind: 'stock'` and the counters show the unit reserved rather than available:
  - `inventoryService.adjust` (stocktake found a unit)
  - `restockReturnedLines` (returned parcel, inside `withTransaction`)
  - `runReservationSweep` (after setting the holder's `expiresAt` to epoch 0 via `reservationModel.updateOne`)
  - `releaseForOrder` (unpaid order canceled)
  - `releaseCommittedForOrder` (paid order canceled)
  - `releaseLinesForOrder` (rest of a shipment canceled)
- A negative test: releasing the waiting buyer's own `backorder` claim via `releaseLinesForOrder` frees allowance only, leaving `available: 0` and `backordered: 0`.

## Relationships
- `src/modules/inventory/services/index.ts`: supplies `inventoryService`, the system under test (`setBackorderLimit`, `reserveForOrder`, `commitForOrder`, `adjust`, `restockReturnedLines`, `runReservationSweep`, `releaseForOrder`, `releaseCommittedForOrder`, `releaseLinesForOrder`).
- `src/modules/inventory/model.ts`: `reservationModel` is used to force a hold to expire directly in the DB.
- `src/modules/inventory/repository.ts`: `reservationRepository` and `stockLevelRepository` are used for read-side assertions.
- `src/infrastructure/runtime/database.ts`: `withTransaction` supplies the session for the service methods that take one.
- `src/modules/products/tests/factories.ts`: `createProduct` builds products with an `onHand` quantity.
- `tests/support/setup-test-db.ts` (`setupTestDb`) and `tests/support/callers.ts` (`testCallerContext`, passed to `adjust`): shared test support.

## Notes
- The order-id padding letter is chosen so ids don't collide with those from other test files.
- Expiry is simulated by back-dating `expiresAt` rather than waiting.
- In the expiry test, two units are released and one goes to the queue, so the other becomes available (`available: 1`).
