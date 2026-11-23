---
source: src/modules/returns/domain/quantities.ts
source_sha256: 07f1cabb78cb75b779ab3b5df67d59e5c0e913a75180b1632503b1780dda4c64
context_sha256: 605547cc1492ac7dff86d6519fe770a1140573f217a9529bc6a9c14504d44087
generated_at: 2026-11-22T07:23:24.392379+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/quantities.ts

## Purpose
Pure functions that decide how much of an order can still be returned, and which lines a return will hold. Because they touch no database, the rule that decides a return's lines can be unit-tested directly.

## Key elements
- `ProductQuantity` — `{ productId: string; quantity: number }`; the common line shape for order lines and return lines.
- `wireLines(lines)` — converts lines whose `productId` is an ObjectId or a string into string-keyed `ProductQuantity[]`, so stored ids and request ids compare equal.
- `quantitiesByProduct(lines)` — sums units per product id into a `Map<string, number>`. A product repeated on several lines counts once.
- `returnableLinesOf(items, isExcluded)` — turns order items into lines, dropping goods the caller's `isExcluded` predicate flags. These are the goods excluded from withdrawal (Art. 16), which never come back.
- `returnableQuantities(ordered, alreadyReturned)` — the ordered quantities less what earlier returns took, clamped at 0 per product.
- `LinesVerdict` — `{ ok: true; lines }`, or `{ ok: false; reason }` where reason is `'nothing-returnable' | 'unknown-product' | 'too-many'`.
- `checkRequestedLines(remaining, requested)` — decides a return's lines.
  - With no requested lines (`undefined` or empty), it returns every product that still has a positive remaining quantity, or `nothing-returnable` if none does.
  - With requested lines, it sums duplicates, rejects products not in `remaining` (`unknown-product`) and quantities above what is left (`too-many`), and otherwise returns the summed lines.
- `takesLastUnit(ordered, accountedFor)` — true when every ordered product's quantity is covered by `accountedFor`. It is the rule behind "shipping is refunded by whichever cancel or return takes the last unit".

## Relationships
- Exported through `src/modules/returns/domain/index.ts`. Its sibling domain modules `src/modules/returns/domain/accounting.ts` and `src/modules/returns/domain/status-projection.ts` are in the same dependency neighborhood.
- The services `src/modules/returns/services/create.ts`, `receive.ts`, `cancel-right.ts`, `cancel-remainder.ts`, `cancellation-refund.ts`, `options.ts`, `outcome.ts`, `projection.ts` and `proof.ts` (all under `src/modules/returns/services/`) depend on it for line and quantity rules.
- `src/modules/returns/tests/unit/domain.test.ts` and `src/modules/delivery/tests/unit/fulfillment.test.ts` also depend on it.

## Notes
- `takesLastUnit` counts against the ordered quantity, not the returnable quantity. A unit that can never come back, such as an excluded line, therefore keeps the order from ever being "whole".
- `checkRequestedLines` has a comment saying the "what remains" logic is deliberately alike across modules but owned by each, and free to diverge.
- `returnableQuantities` only subtracts from products already in `ordered`. A returned product that was never ordered is ignored.
