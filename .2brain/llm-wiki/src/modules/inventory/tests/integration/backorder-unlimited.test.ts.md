---
source: src/modules/inventory/tests/integration/backorder-unlimited.test.ts
sha256: f20f9d5926be87a2a15357dd980338390b5dc3f3e830aa4ef718f1b6a0fdbbcf
generated_at: 2026-11-08T06:05:24.682279+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/backorder-unlimited.test.ts

## Purpose

Integration tests that pin down the semantics of the `backorderLimit` field: `null` means unlimited (no ceiling), `0` means closed (refuses all claims), and a stock-level document that simply lacks the field is treated as closed—not open. Each case is exercised through the full service layer against a real database.

## Key elements

- **`anOrderId()`** — module-level counter that mints a syntactically valid, unique 24-char hex order id per call; used as the hold key.
- **`claim(productId, quantity)`** — shorthand to build a single `{ productId, quantity, kind: 'backorder' }` reservation line.
- **`productWithCap(limit)`** — helper that creates a zero-on-hand product with `allowBackorder: true`, then calls `inventoryService.setBackorderLimit` with the given `limit` (or `null`); returns the product id.
- **`describe('an unlimited backorder cap')`** — five tests covering: successful claim with no ceiling, `availableFor` returning `Infinity`, `listPreorders` omitting `backorderLimit`/`left`, the same omission for a non-preorder product, and re-capping after an unlimited claim (subsequent over-limit claim is rejected with a shortfall).
- **`describe('a closed backorder cap')`** — two tests: a `0` cap refuses a claim, and a document with the field physically absent (via `$unset`) is treated as closed.

## Relationships

- **`src/modules/inventory/services/index.ts`** — all business-logic calls go through `inventoryService`: `setBackorderLimit`, `reserveForOrder`, `availableFor`, `listPreorders`.
- **`src/modules/inventory/repository.ts`** — `stockLevelRepository.findByProductId` is used to assert persisted state after a successful claim.
- **`src/modules/inventory/model.ts`** — `stockLevelModel.collection.updateOne({ $unset: … })` bypasses the Mongoose schema to remove the `backorderLimit` key entirely, simulating a legacy/absent document.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product with the required `onHand` and `allowBackorder` flags.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` (called once at module top) provisions and resets the test database.

## Notes

- The "field absent" test intentionally skips the repository layer and talks to the raw MongoDB collection via `stockLevelModel.collection`, because the Mongoose schema would re-populate the field with its default on any `save`. This is the only place in the file where the model is used directly.
- `orderCounter` is module-scoped mutable state; it is not reset between test runs, so order ids are only unique within a single process lifetime.
- Assertions on `listPreorders` use `not.toHaveProperty` to verify that the API surface deliberately hides the limit and "remaining" concept for unlimited caps.
