---
source: src/modules/inventory/tests/integration/top-up.test.ts
source_sha256: c7b08e7139d3a51d1ee9a4ee323eb264730d7e2d062518c7a75cc95b59458785
context_sha256: bc622b8957ee8c227ccbe0f763d52c00dd074863a480b78221f6aabd16bfde39
generated_at: 2026-11-22T05:28:20.869507+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/top-up.test.ts

## Purpose
Integration tests for topping up an order's stock hold after a parcel was lost, covering `inventoryService.reserveMoreForOrder` and `releaseTopUpForOrder`. They check that free shelf units are reserved (never another order's), that the remainder is claimed outside the closed backorder cap, that an ended hold is reopened as `committed` with its original `committedAt`, and that giving the top-up back ends the hold `shipped`, not `released`.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `anOrderId()`: returns a unique 24-character hex-style order id from a counter, padded with `e`.
- `productWith(shelf)`: creates a product with `shelf` units on hand and returns its id as a string. Backorder is closed (cap 0, the default).
- `shippedOrder(productId, quantity)`: reserves, commits and ships `quantity` units for a new order, and returns the order id.
- `levelOf`, `holdOf`, `itemsOf`, `statusOf`: read helpers. `levelOf` returns the stock level counters (`onHand`, `reserved`, `available`, `backordered`). `holdOf` returns the hold's `status`, `committedAt` and items (`quantity`, `kind`). `itemsOf` and `statusOf` return one part of `holdOf`.
- `topUp(orderId, productId, quantity)`: calls `reserveMoreForOrder` inside `withTransaction`.
- `describe('reserveMoreForOrder')` cases:
  - Reserves the free shelf units and owes nothing when the shelf covers the parcel.
  - Reopens a `shipped` hold as `committed`, keeping `committedAt`.
  - Claims what the shelf can't cover as `backorder` items. The result is `{ productId, shelf, owed }`.
  - Writes the owed units to the ledger with reason `owed`, not `backorder`.
  - Lets an owed claim past the closed cap, while a new `reserveForOrder` sale with `spill: true` is still refused (`held: false` plus `shortfalls`).
  - Never takes units held for another order.
  - Grows an open hold instead of replacing it.
  - Claims nothing and does not fail when the product has no stock level (after `removeLevel`).
- `describe('releaseTopUpForOrder')`: releasing both the shelf and backorder parts zeroes `reserved` and `backordered`, and leaves the hold `shipped`.

## Relationships
- `src/infrastructure/runtime/database.ts`: provides `withTransaction`, used for `shipLinesForOrder`, `reserveMoreForOrder` and `releaseTopUpForOrder`.
- `src/modules/inventory/services/index.ts`: exports `inventoryService`, the code under test.
- `src/modules/inventory/repository.ts`: `reservationRepository`, `stockLevelRepository` and `stockMovementRepository` are used to read state back for assertions.
- `src/modules/inventory/tests/factories.ts`: provides `removeLevel`.
- `src/modules/products/tests/factories.ts`: provides `createProduct`.
- `tests/support/setup-test-db.ts` and `tests/support/callers.ts`: provide `setupTestDb` and `testCallerContext`.
- `src/modules/inventory/services/levels.ts` and `src/modules/delivery/tests/unit/fulfillment.test.ts` are graph neighbors, but this file doesn't import them directly.

## Notes
- The order id helper pads with `e` so ids from this file don't collide with ids from other test files.
- `reserveMoreForOrder` returns per-product `{ productId, shelf, owed }`. `owed` units go to the ledger with reason `owed`, distinct from a preorder's `backorder`.
- The test for a product with no stock level expects `{ shelf: 0, owed: 0 }` and no error.
