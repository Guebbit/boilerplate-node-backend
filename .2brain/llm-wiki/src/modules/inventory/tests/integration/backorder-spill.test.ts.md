---
source: src/modules/inventory/tests/integration/backorder-spill.test.ts
source_sha256: 32ee6dd1869ec78b764b3d63d0b214c38331504f0739b397f5dea9088e75903d
context_sha256: cd5d41f9f9c7c2da6fe7bd7a2657d495a8e760c8afc91c3c6febcea59d232975
generated_at: 2026-11-22T05:25:52.625892+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/backorder-spill.test.ts

## Purpose
Integration tests for reserving an order line that "spills" past the shelf stock. The shelf portion is reserved, the remainder is claimed against the product's backorder cap, and the reservation records which units are `stock` and which are `backorder`. All of this happens in one transaction. The tests cover the fits-on-shelf, partial-spill, empty-shelf, refusal, rollback, race and failure-injection cases.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `anOrderId()`: returns a unique 24-character hex-style order id from a module-level counter. Reservations are keyed by order id.
- `productWith(shelf, limit)`: creates a product with `onHand: shelf` and `allowBackorder: true`, then sets its backorder limit (`null` for none) through `inventoryService.setBackorderLimit`. Returns the product id string.
- `spilling(productId, quantity)`: builds a line with `spill: true`.
- `levelOf(productId)`: reads `reserved`, `available` and `backordered` from the stock level.
- `itemsOf(orderId)`: reads the reservation's items as `{ quantity, kind }` pairs.
- A single `describe('reserving a line that may spill')` block calls `inventoryService.reserveForOrder` in each case:
  - **Fits on shelf:** 5 on hand, cap 10, reserve 3. Result is `held: true, owed: []`, one `stock` item of 3, and levels reserved 3 / available 2 / backordered 0.
  - **Partial spill:** 2 on hand, reserve 3. Result is `owed: [{ productId, quantity: 1 }]`, items `stock` 2 plus `backorder` 1, and levels reserved 2 / available 0 / backordered 1.
  - **Empty shelf:** 0 on hand, reserve 3. The whole line is a single `backorder` item of 3.
  - **Refusal:** 2 on hand, cap 0, reserve 3. Result is `held: false` with `shortfalls: [{ productId, requested: 3, available: 2 }]`. Nothing is taken and the reservation's status is `released`.
  - **Multi-line rollback:** a later line refused by its cap leaves both products' counters unchanged.
  - **Race:** two concurrent reservations for the last unit (1 on hand, cap 10). Both are held, exactly one unit is owed in total, and levels end at reserved 1 / backordered 1.
  - **Hold failure:** the repository's `pushItems` is mocked to reject once. The call rejects with that error, nothing stays reserved, and the reservation's status is `released`.

## Relationships
- `../../services` (`src/modules/inventory/services/index.ts`): supplies `inventoryService`, the code under test (`reserveForOrder`, `setBackorderLimit`).
- `../../repository` (`src/modules/inventory/repository.ts`): supplies `stockLevelRepository` and `reservationRepository`. The tests use them to assert state (`findByProductId`, `findByOrderId`), and `pushItems` on `reservationRepository` is spied on to inject a failure.
- `@modules/products/tests/factories` (`src/modules/products/tests/factories.ts`): `createProduct` seeds products.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): `setupTestDb` provides the database for the tests.
- `src/modules/delivery/tests/unit/fulfillment.test.ts` is a graph neighbor, but this file has no visible interaction with it.

## Notes
- Each test uses its own freshly created product and order id, so tests do not share state.
- In the refusal and failure-injection cases, the reservation is expected to exist with status `released` rather than be absent.
- The race test checks only the total owed quantity (`[1]`) across both outcomes. It does not check which checkout gets the shelf unit.
- The `pushItems` spy is restored with `mockRestore()` only after the awaited rejection assertion. If that assertion throws, the restore is skipped.
