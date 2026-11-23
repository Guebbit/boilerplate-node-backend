---
source: src/modules/inventory/tests/integration/backorder-unlimited.test.ts
generated_at: 2026-11-22T05:26:07.062861+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/backorder-unlimited.test.ts

## Purpose
Integration tests for the inventory backorder cap semantics: `backorderLimit: null` means unlimited, `0` means closed (refuses), and a stock-level row lacking the field is treated as closed rather than unlimited. Covers reservation, the checkout pre-flight, and the preorder board. Its header comment points to a doc for preorders, but that doc is not part of the dependency graph.

## Key elements
- `setupTestDb()` — called at module level to set up the test database.
- `anOrderId()` — returns a distinct 24-char hex-like order id (counter padded with `'d'`), since holds are keyed by order id.
- `claim(productId, quantity)` — builds a `kind: 'backorder'` line for `reserveForOrder`.
- `productWithCap(limit)` — creates a product with `onHand: 0` and `allowBackorder: true`, applies `setBackorderLimit`, and returns the product id string.
- `describe('an unlimited backorder cap')`:
  - A claim of 1000 is held and the level records `backorderLimit: null, backordered: 1000`.
  - `availableFor` reports `available: Infinity`.
  - `listPreorders` returns the product with neither `backorderLimit` nor `left` properties.
  - The same omission applies to a product that is neither a preorder nor open to backorder (it still appears in `listPreorders`).
  - After claiming 3 under a null cap, setting the limit to 4 makes a claim of 2 fail with `held: false` and `shortfalls: [{ available: 1 }]`.
- `describe('a closed backorder cap')`:
  - A limit of `0` refuses a claim of 1, with `available: 0`.
  - A level whose `backorderLimit` field was removed is treated as closed (`held: false`).

## Relationships
- `src/modules/inventory/services/index.ts` — exports `inventoryService`, the system under test, via `setBackorderLimit`, `reserveForOrder`, `availableFor` and `listPreorders`.
- `src/modules/inventory/repository.ts` — `stockLevelRepository.findByProductId` is used to check persisted `backorderLimit` and `backordered`.
- `src/modules/inventory/model.ts` — `stockLevelModel` is used through its raw collection with `$unset` to remove `backorderLimit`.
- `src/modules/products/tests/factories.ts` — `createProduct` creates the product fixtures.
- `tests/support/setup-test-db.ts` — `setupTestDb` provides the test database lifecycle.

## Notes
- The `$unset` goes through the raw driver on purpose, because the schema would restore its default if the model's normal path were used.
- `listPreorders` tests expect exactly one item, so they depend on the database being reset between tests by `setupTestDb`. This is inferred, not shown in the file.
- The order-id helper's padding letter is chosen so ids don't collide with those from other test files.
