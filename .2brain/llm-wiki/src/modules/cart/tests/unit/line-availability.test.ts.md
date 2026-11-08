---
source: src/modules/cart/tests/unit/line-availability.test.ts
sha256: 0302103562389909e02bd4f3013d1c28e9487985f1d393517a80a096f526bb2c
generated_at: 2026-11-08T05:24:40.811024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/line-availability.test.ts

## Purpose

Pure unit test for the `lineAvailability` precedence function and the `isBuyable` gate, covering every row of the availability state table for both cart lines (with quantity) and wishlist lines (without quantity). Exists to lock down the single-source-of-truth rule that decides whether a line is `in_stock`, `preorder`, `backorder`, `insufficient_stock`, `out_of_stock`, `unavailable`, or `removed`. No mocks, no database.

## Key elements

- **`LIVE`** — shared fixture (`{ active: true, purchasable: true }`); every table row mutates one field from this base.
- **`describe('lineAvailability')` / cart `it.each` table** — 22 cases exercising the full precedence ladder (missing product → soft-deleted → hidden → off-sale → no stock → quantity shortfall → in-stock) plus `preorder` and `backorder` branches, including edge cases like `Infinity` stock and an empty `{}` product object.
- **`describe('lineAvailability')` / wishlist `it.each` table** — 8 cases with the same product flags but **no `quantity` field**, confirming the simplified wishlist path.
- **Wishlist "never insufficient_stock" guard** — maps several `available` values through `lineAvailability` and asserts the result set excludes `'insufficient_stock'`.
- **`describe('isBuyable')`** — positive (`in_stock`, `preorder`, `backorder`) and negative (`insufficient_stock`, `out_of_stock`, `unavailable`, `removed`) assertions.
- **`AvailabilityFacts`** (type import) — the input shape used throughout; cart facts carry `quantity`, wishlist facts omit it.

## Relationships

- **`src/modules/cart/domain/availability.ts`** — source of the `lineAvailability` function and the `AvailabilityFacts` type under test.
- **`src/modules/cart/domain/index.ts`** — barrel re-export; the test imports `isBuyable`, `lineAvailability`, and `AvailabilityFacts` from `../../domain` (i.e., this barrel) rather than reaching into the implementation file directly.

## Notes

- The test is fully table-driven via `it.each`; adding a new availability state requires a new row in **both** the cart and wishlist tables.
- Wishlist facts intentionally omit `quantity`; the "never insufficient_stock" test is a regression guard for that invariant, not a duplicate of the table row.
- `Infinity` is used as a legitimate `available` value to model "unlimited backorder" — don't replace it with a large number.
- The `{ product: {} }` case (flags never set) asserts the function treats missing booleans as truthy defaults; this is a deliberate contract, not an oversight.
- Preorder rows include a `shelf` value to document that **shelf is ignored** for preorders; the expected output is still `'preorder'`, not `'in_stock'`.
