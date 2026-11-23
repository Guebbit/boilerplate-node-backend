---
source: src/modules/products/domain/availability.ts
source_sha256: 67f10f533c29f28113ca20b894135dc0e6e5e6cc114d0e90e3437d97f6ff22d5
context_sha256: ca582ed5dc7f7c4711ffeb8e6ea5cd3b835a44af3b5a6b878778664dc7439687
generated_at: 2026-11-22T07:08:49.816161+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/domain/availability.ts

## Purpose
Pure domain logic that decides what a shopper is told about a product's stock, using Google Merchant's vocabulary: `availability` plus, for `preorder`/`backorder`, an `availabilityDate`. The clock and the shop's backorder promise are passed in as arguments, so the file imports no module. Terms come from the product's own settings; counts come from inventory.

## Key elements
- `Availability` — union `'in_stock' | 'out_of_stock' | 'preorder' | 'backorder'`. `out_of_stock` covers every "cannot be ordered" case.
- `AvailabilityTerms` — product settings (extends `PreorderFacts`): `allowBackorder`, `restockDate`, `deletedAt`.
- `AvailabilityCounts` — inventory counts: `available` (on hand minus reserved), `backorderLimit` (`null` = no cap, absent = closed), `backordered`.
- `AvailabilityFacts` — result: `availability` and optional `availabilityDate` (only with `preorder` or `backorder`).
- `availabilityOf(terms, counts, now, promiseDays)` — computes the result. Evaluation order:
  1. Deleted, `active === false` or `purchasable === false` → `out_of_stock`.
  2. `isPreorder(terms, now)` → `preorder` with `releaseDate` if the allowance has room and `releaseDate` is set, else `out_of_stock`.
  3. `counts.available > 0` → `in_stock`.
  4. Allowance left and `isBackorder(terms, now)` → `backorder`, dated `restockDate` or `now + promiseDays` days.
  5. Otherwise `out_of_stock`.

## Relationships
- `src/domain-primitives/time.ts` — supplies `DAY_MS` for the default backorder date.
- `src/modules/products/domain/preorder.ts` — supplies `isPreorder` and the `PreorderFacts` type that `AvailabilityTerms` extends.
- `src/modules/products/domain/backorder.ts` — supplies `isBackorder`.
- `src/modules/products/domain/stock.ts` — supplies `preorderAllowanceLeft`, which is applied to the backorder limit and count.
- `src/modules/products/domain/index.ts` and `src/modules/inventory/services/availability.ts` — neighbors in the graph; the file's doc comment says the counts come from inventory's level, but this file imports neither.
- `src/modules/products/tests/unit/availability.test.ts` — unit tests for this logic.

## Notes
- The same `preorderAllowanceLeft(backorderLimit, backordered)` check gates both preorders and backorders, so the one cap applies to both.
- A preorder with a full allowance, or without a `releaseDate`, is `out_of_stock`. It does not fall through to `in_stock` or `backorder`.
- Preorder is checked before shelf stock, so a product before its release date reads `preorder` even if units are available.
- `availabilityDate` is an instant. The caller is expected to show it as the shop's calendar day.
- `promiseDays` is a parameter because the layer imports no module. The doc names `shop`'s `BACKORDER_PROMISE_DAYS` as its source.
