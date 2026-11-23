---
source: src/modules/products/tests/unit/availability.test.ts
source_sha256: 9da6df886cb3bcac7c556cb47b51e9b78d386fd8b5f9c45b9a2e1146bdba8a78
context_sha256: 1fff0d5d107144deea427fbee1f169a98e5bca911a33bea37dc2752a80c01df4
generated_at: 2026-11-22T07:18:56.294566+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/availability.test.ts

## Purpose
Unit tests for `availabilityOf` from the products domain, which computes Google Merchant's `availability` and `availabilityDate` from a product's settings ("terms") and inventory counts. The function is pure, so the tests pin it to a fixed clock and exercise each edge case.

## Key elements
- `PROMISE_DAYS` (30): days promised when a backorder has no restock date.
- `NOW` (`2026-10-12T10:00:00Z`): the instant availability is judged at.
- `LATER` / `EARLIER`: fixed dates after and before `NOW`, used for restock and release dates.
- `it.each` table in `describe('availabilityOf')`: each row is `[name, terms, counts, expected]` and asserts `availabilityOf(terms, counts, NOW, PROMISE_DAYS)` with `toEqual`. Cases covered:
  - **Shelf stock:** `available > 0` gives `in_stock`; `0` gives `out_of_stock`. Shelf units win even when backorder is open.
  - **Backorder:** with an empty shelf and `allowBackorder`, the result is `backorder`. The date is `restockDate` if given, otherwise `NOW` + 30 days (`2026-11-11T10:00:00Z`). It becomes `out_of_stock` when `backordered` reaches `backorderLimit` or the restock date has passed.
  - **Preorder:** a future `releaseDate` gives `preorder` with `availabilityDate` set to the release date. It becomes `out_of_stock` when the allowance (`backorderLimit`) is full or unset. A past `releaseDate` gives plain `in_stock`.
  - **Unsellable products:** `active: false`, `purchasable: false`, or a `deletedAt` set all give `out_of_stock` even with stock.
- Date-arithmetic test: from `2026-12-20T12:00:00Z`, the promised 30 days land on `2027-01-19T12:00:00Z`, which crosses a month and a year boundary.

## Relationships
- Imports `availabilityOf` from `src/modules/products/domain/availability.ts`, the only unit under test. There are no mocks, since the function is pure.

## Notes
- Expected results omit `availabilityDate` for `in_stock` and `out_of_stock`, and `toEqual` treats a missing property and `undefined` alike.
- Backorder cap `null` (`backorderLimit: null`) is tested only together with a restock date.
