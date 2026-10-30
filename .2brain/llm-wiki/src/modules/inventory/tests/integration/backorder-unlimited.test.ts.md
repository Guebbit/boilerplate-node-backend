---
source: src/modules/inventory/tests/integration/backorder-unlimited.test.ts
sha256: f20f9d5926be87a2a15357dd980338390b5dc3f3e830aa4ef718f1b6a0fdbbcf
generated_at: 2026-10-29T04:06:33.847535+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/backorder-unlimited.test.ts

## Purpose

Integration tests verifying how the inventory reservation system handles three edge cases of the `backorderLimit` field: an explicit `null` (unlimited ceiling), an explicit `0` (closed, refuses claims), and a missing field on the level row (treated as closed, *not* as open). Confirms correct behavior across reservation, pre-flight availability, and preorder listing.

## Key elements

- **`anOrderId()`** — returns a syntactically valid 24-char hex order ID, incrementing a module-level counter per call (holds are keyed by this).
- **`claim(productId, quantity)`** — shorthand for a single backorder claim line item.
- **`productWithCap(limit)`** — creates a zero-stock product with `allowBackorder: true`, then calls `inventoryService.setBackorderLimit` with the given limit.
- **`describe('an unlimited backorder cap')`** — five tests: claims without ceiling; `availableFor` returns `Infinity`; `listPreorders` omits `backorderLimit`/`left`; same omission when product is neither a preorder nor open; re-capping from `null` to a finite number enforces the new cap.
- **`describe('a closed backorder cap')`** — two tests: `0` refuses all claims; a row with the field `$unset` (simulating legacy data) is treated as closed, not unlimited.

## Relationships

- **`inventoryService`** (`src/modules/inventory/services/index.ts`) — the system under test; exercises `setBackorderLimit`, `reserveForOrder`, `availableFor`, and `listPreorders`.
- **`stockLevelRepository`** (`src/modules/inventory/repository.ts`) — used to assert persisted state (`findByProductId`) after a reservation.
- **`stockLevelModel`** (`src/modules/inventory/model.ts`) — accessed directly via `stockLevelModel.collection.updateOne` to `$unset` the field (bypasses schema defaults).
- **`createProduct`** (`src/modules/products/tests/factories.ts`) — factory for zero-stock test products.
- **`setupTestDb`** (`tests/support/setup-test-db.ts`) — resets and prepares the test database before the suite runs.

## Notes

- The "missing field" test uses the raw Mongoose collection driver (`stockLevelModel.collection.updateOne` with `$unset`) specifically because the Mongoose schema would re-apply a default value on save, defeating the purpose of simulating a legacy row.
- `availableFor` returns `Infinity` (not a large number) as the sentinel for unlimited backorder availability.
- `listPreorders` deliberately omits the `backorderLimit` and `left` properties (rather than setting them to `null` or `undefined`) when the cap is unlimited — asserted via `not.toHaveProperty`.
