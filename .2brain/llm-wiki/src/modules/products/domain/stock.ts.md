---
source: src/modules/products/domain/stock.ts
source_sha256: 1675fd5b7cdbf17e3e85a2142dfdb7d15d1390d9c9125395c74e9319d94d6796
context_sha256: 76429bb93c025bb2b9107cae90df58b7269e7239b5c8a08ee76708503bc922de
generated_at: 2026-11-22T07:09:30.200853+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/domain/stock.ts

## Purpose
Pure helpers that compute customer-facing quantities for a product: how many units can be bought now, and how many preorder units remain. It sits beside the product model because catalogue availability is this module's own invariant. It is not placed in `inventory` or `cart`, which hold no catalogue rules. The module doc says `tax.ts` follows the same reasoning for `resolveTaxRate`.

## Key elements
- `availableStock(onHand?, reserved?)` returns `max(0, onHand - reserved)`. Absent arguments count as 0. The clamp ensures a negative count never reaches a screen, even though inventory transitions are meant to keep `reserved <= onHand`.
- `preorderAllowanceLeft(backorderLimit?, backordered?)` returns the units still available to preorder:
  - `backorderLimit === null` means no cap, and the function returns the `UNLIMITED_ALLOWANCE_SHOWN` constant (999,999).
  - An absent limit counts as 0, which closes the preorder.
  - Otherwise it returns `max(0, limit - backordered)`. The clamp is needed because the allowance can be lowered below the units already claimed.
- `UNLIMITED_ALLOWANCE_SHOWN` (private, 999,999) is the integer shown for an uncapped allowance. The contract requires an integer, and buyers are never shown the real count.

## Relationships
The listed neighbors are `src/modules/products/domain/availability.ts`, `src/modules/products/domain/index.ts`, `src/modules/products/tests/factories.ts` and `src/modules/products/tests/unit/stock.test.ts`. Only the following is visible from this file's own content:
- The doc comment says the inputs are the two stock counters of `@modules/inventory`'s level. The file has no imports, so the data comes from callers.
- Per the module doc, the result feeds `available`. The file does not show how `availability.ts` or `index.ts` use these helpers.
- The test files are not referenced from this file.

## Notes
- `null` and an absent value mean different things for `backorderLimit`. `null` is unlimited and an absent value is zero, which is closed.
- The 999,999 value is a display sentinel, not a real quantity. Callers should not use it in arithmetic.
