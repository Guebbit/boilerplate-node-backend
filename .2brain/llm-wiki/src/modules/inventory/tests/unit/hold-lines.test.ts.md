---
source: src/modules/inventory/tests/unit/hold-lines.test.ts
sha256: 7d8e2b1e5bba8050531674e7441a79aac766ea9d3ef0de7ba986fb7e4fcc751b
generated_at: 2026-10-29T04:08:50.550803+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/hold-lines.test.ts

## Purpose

Unit tests for the pure hold-line arithmetic: removing quantity from a hold (partial shipment or cancelled remainder) via `takeFromHold`, and appending quantity to a hold via `withAdded`. Exists to pin down the invariants of these operations—especially the interaction between shelf units and preorder (`backorder`) claims—so that regressions in allocation logic are caught at the function level.

## Key elements

- **`describe('takeFromHold')`** — Six cases covering: partial take per product, full consumption (hold empties), over-request clamping, unknown product (no-op), summing across duplicate product lines, and referential purity (input array unchanged).
- **`describe('takeFromHold, with preorder claims')`** — Five cases covering: kind-scoped take (backorder vs. shelf), shelf lines never matching a claim, backorder lines falling back to shelf units that replaced the claim, claim-first then shelf-overflow ordering, and shelf lines never consuming a claim.
- **`describe('withAdded')`** — Three cases covering: merging same-product/same-kind lines, keeping shelf and backorder lines of the same product as separate entries, and the empty-hold identity.

## Relationships

- **`src/modules/inventory/domain/index.ts`** — Barrel import source; the test imports `takeFromHold` and `withAdded` from `../../domain`, which re-exports them.
- **`src/modules/inventory/domain/hold-lines.ts`** — The module under test; contains the implementations of both functions.

## Notes

- Purity is explicitly tested: the input `hold` array must not be mutated by `takeFromHold`.
- A line with no `kind` field is always treated as a shelf unit and will never satisfy a `backorder` request.
- A `backorder` line *can* consume shelf units (the "fallback" case), but the reverse is never allowed.
- `withAdded` merges by `(productId, kind)` pair; same product with different kinds stays as separate lines.
- Test fixtures use single-character product IDs (`'a'`, `'b'`, `'z'`) for readability; the `'z'` product is deliberately absent from the hold to exercise the no-op path.
