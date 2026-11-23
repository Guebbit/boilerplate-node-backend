---
source: src/modules/products/tests/unit/actions.test.ts
source_sha256: 1524f365fbe655ed96c17ad8dfe6e528e31a62070fdceba7e024d1497f1c8fd2
context_sha256: df2fa915ebd93c526c7922e67d7cce9389932f1056534a1c18575d55b8fc99ac
generated_at: 2026-11-22T07:18:50.010119+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/actions.test.ts

## Purpose
Unit tests for `productActions`, which computes one boolean flag per "door" (`update`, `delete`, `restore`, `hardDelete`) from the caller's keys and whether the product is soft-deleted. The function is pure, so the whole truth table runs without a database.

## Key elements
- `LIVE`: fixture for a product that is not deleted (`{}`).
- `DELETED`: fixture for a product soft-deleted via `deletedAt: '2026-11-01T10:00:00.000Z'`.
- `describe('productActions')` with a single `it.each` table of 7 cases. Each case is `[name, standing, product, [update, delete, restore, hardDelete]]`. The test calls `productActions(product, standing)` and compares the four flags in that order.

Expected results by case:

| Standing | Live | Deleted |
|---|---|---|
| `NO_PRODUCT_STANDING` | all false | all false |
| `update` key only | `update` only | not covered |
| `delete` key only | `delete` and `hardDelete` | `restore` and `hardDelete` |
| both keys | `update`, `delete`, `hardDelete` | `update`, `restore`, `hardDelete` |

## Relationships
- Imports `productActions` and `NO_PRODUCT_STANDING` from `src/modules/products/domain/actions.ts`, the only module under test. `NO_PRODUCT_STANDING` is the "caller holds no keys" standing.

## Notes
- The `delete` key controls `delete`, `restore` and `hardDelete`. `hardDelete` follows the `delete` key regardless of the product's deleted state.
- `delete` is true only while the product is live. `restore` is true only while it is deleted.
- `update` follows the `update` key regardless of the product's deleted state.
- A caller with no keys gets all flags false, whether the product is live or deleted.
- The deleted-with-update-key-only case is not in the table.
