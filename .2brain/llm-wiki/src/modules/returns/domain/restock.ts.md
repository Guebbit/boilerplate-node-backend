---
source: src/modules/returns/domain/restock.ts
source_sha256: 14092723d1d7bdb9ba21155422c71c73303a1816f49dc5f52bd3597d88f4d8bd
context_sha256: 95dc44a12c1e086eedd6fa46c2a778cba4909c72ccc73ea508e28ff02598fb9c
generated_at: 2026-11-22T07:24:21.418023+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/restock.ts

## Purpose
Pure domain rule that decides how many units of each returned line go back on sale when a return is received. Staff can give a per-line restock count (e.g. 0 for a broken unit); with no count, everything is restocked. Keeping it pure makes the rule that stops broken units reaching the shelf (and hence a backorder buyer) testable without a database.

## Key elements
- `RestockRequest`: `{ productId, restock }`, a staff-supplied count for one line.
- `RestockVerdict`: discriminated union. `{ ok: true, restocked: number[] }` gives one count per returned line, in the line's own order. `{ ok: false, index, reason }` gives the position of the offending request entry and a reason: `'unknown-product' | 'duplicate' | 'too-many'`.
- `resolveRestock(lines, requested)`: the rule itself.
  - Lines not named in the request default to their full `quantity`.
  - `requested` of `undefined` restocks everything.
  - It rejects the first entry that names a product not in the return, names a product twice, or asks for more than the line's quantity.
- `ReturnedLine` (internal, not exported): minimal line shape, with `productId` (anything with `toString()`) and `quantity`.

## Relationships
- Re-exported through `src/modules/returns/domain/index.ts`, the domain's public surface.
- `src/modules/returns/services/receive.ts` is a neighbor; it presumably calls this rule when goods are received, which is the use the module doc describes.
- `src/modules/returns/tests/unit/domain.test.ts` exercises the rule directly. `src/modules/delivery/tests/unit/fulfillment.test.ts` is also linked in the graph.

## Notes
- Product ids are compared as strings (`String(productId)`), so ObjectId-like values work against string ids in requests.
- Validation stops at the first bad entry, so only one failure is reported, identified by its request `index`.
- Only the upper bound is checked (`restock > quantity`). The code does not check for negative or non-integer counts.
- Returned lines are assumed to be one per product.
