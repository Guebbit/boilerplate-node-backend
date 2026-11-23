---
source: src/modules/cart/tests/unit/line-availability.test.ts
source_sha256: 0302103562389909e02bd4f3013d1c28e9487985f1d393517a80a096f526bb2c
context_sha256: 8fba19d611ed8affda54e5e14639ef336552961a68603f4bd5d8c7deefaeec71
generated_at: 2026-11-22T04:43:07.278072+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/line-availability.test.ts

## Purpose
Unit tests for `lineAvailability`, the single precedence rule that decides the availability state of a cart line, a wishlist line, a merge result, and checkout's refusal. The file covers every row of the precedence table for both cart and wishlist variants, and also tests `isBuyable`. It uses no mocks and no database.

## Key elements
- `LIVE`: base product fixture (`active: true, purchasable: true`). Each case changes one field of it.
- `describe('lineAvailability')` with a cart-line `it.each` table. Facts include `product`, `available`, `quantity` and optionally `shelf`. Expected states covered:
  - `removed`: product is null, undefined, soft-deleted (`deletedAt`) or hidden (`active: false`). Hidden wins even over preorder or off-sale.
  - `unavailable`: off-sale (`purchasable: false`), whether or not stock is left.
  - `out_of_stock`: `available` is 0 or undefined (no level row).
  - `insufficient_stock`: `quantity` is greater than `available`.
  - `in_stock`: `quantity` is at most `available`. A product with no flags set also counts as in stock.
  - `preorder`: the allowance covers the line. The shelf is ignored for preorders.
  - `backorder`: the shelf covers only part of the line (or is empty) and `available` covers the rest. An unlimited backorder (`available: Infinity`) is also `backorder`.
  - A backorder product whose shelf covers the whole line is `in_stock`.
- Wishlist-line `it.each` table: facts have no `quantity`. It checks the same states except `insufficient_stock`.
- Test "never gives a wishlist line insufficient_stock": checks `available` values 0, 1, 5 and 999.
- `describe('isBuyable')`: returns `true` for `in_stock`, `preorder` and `backorder`. Returns `false` for `insufficient_stock`, `out_of_stock`, `unavailable` and `removed`.

## Relationships
- Imports `isBuyable`, `lineAvailability` and the `AvailabilityFacts` type from `../../domain`, the barrel `src/modules/cart/domain/index.ts`. The implementation is in `src/modules/cart/domain/availability.ts`, which is presumably re-exported by that barrel.

## Notes
- The test titles use the format `'cart line, %s: %s'`, with the label and the expected state as the two parameters.
- For backorder products, `available` is read as the total that can be sold, and `shelf` as the physical stock. The cases `available: 15, shelf: 5` and `available: 12, shelf: 2` show this.
