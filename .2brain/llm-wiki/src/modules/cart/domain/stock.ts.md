---
source: src/modules/cart/domain/stock.ts
source_sha256: dcf048bf627296d23b23c337178cae1326955cf5fe7f62cbba65ba6e9c750b1f
context_sha256: 2a94908e194145bba57c4319ee4b367e0ed0233b63c5cd022143df1dd6b5c694
generated_at: 2026-11-22T04:32:47.078380+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/domain/stock.ts

## Purpose
Defines the cart's single stock rule: whether a line's quantity fits what is currently for sale. It is a pure function, shared so that every caller applies the same verdict. The callers named in the file are checkout's pre-flight (which refuses), the merge (which flags the result) and the cart view (which flags every line).

## Key elements
- `fitsStock(quantity, available)`: returns `true` when `quantity <= (available ?? 0)`.
  - An exactly equal quantity fits.
  - `available` of `null` or `undefined` (product gone or hidden) is treated as 0, so nothing fits.
  - It returns only a boolean. Callers turn it into a refusal or a flag, never into a stock number, because exact stock is reserved for holders of `read:StockLevel`.

## Relationships
- `src/modules/cart/tests/unit/stock-rule.test.ts` is the unit test for this rule.
- `src/modules/cart/domain/index.ts` and `src/modules/cart/domain/availability.ts` are graph neighbors. The file content shows no direct interaction with either.
- The `available` value is supplied by the caller (the service layer, per the file's header comment). This file reaches no sibling module.

## Notes
- Treating unknown availability as 0 is deliberate. The file calls "nothing to sell" the safe direction to be wrong in for a rule that guards a purchase.
