---
source: src/modules/inventory/tests/unit/hold-lines.test.ts
source_sha256: 757cac50680064ef8432d24e70fe37dad788db8324712e9621348667d5a0ef95
context_sha256: f5f1762d03ab4348bd7f790a29ce2f9120ad8634189147ac011fb7cbeda8e797
generated_at: 2026-11-22T05:28:27.598317+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/unit/hold-lines.test.ts

## Purpose
Unit tests for the pure hold-line arithmetic in the inventory domain: `takeFromHold` (removing lines from a hold, as in a partial shipment or a canceled remainder) and `withAdded` (adding lines to a hold). No I/O or mocks are involved; every test is plain input/output.

## Key elements
- **`describe('takeFromHold')`**: covers the base behavior for lines without a `kind`:
  - Takes the requested quantity per product and returns `{ remaining, taken }`.
  - Empties the hold when everything is taken.
  - Caps the take at what the hold carries, so `taken` reflects what was actually set aside.
  - Takes nothing for a product the hold does not carry.
  - Sums a product named twice in the request, and a product held on two lines.
  - Does not mutate the input hold.
- **`describe('takeFromHold, with preorder claims')`**: covers lines with `kind: 'backorder'`:
  - A request takes from the kind it names and leaves the other kind alone.
  - A request line with no `kind` means shelf units and never takes a claim.
  - A backorder request falls back on shelf units when no claim exists. The case is stock allocated before the fulfillment order learns of it.
  - A backorder request takes the claim first, then shelf units only for the shortfall.
- **`describe('withAdded')`**:
  - Increases quantity for the same product and kind.
  - Keeps `backorder` and shelf lines of one product as separate lines.
  - Returns just the added lines when the hold is empty.

## Relationships
- Imports `takeFromHold` and `withAdded` from `../../domain`, the domain barrel `src/modules/inventory/domain/index.ts`.
- The functions under test live in `src/modules/inventory/domain/hold-lines.ts`, which the barrel re-exports. The tests exercise them only through that barrel.

## Notes
- Line shape is `{ productId, quantity, kind? }`. An absent `kind` is shelf units, and `'backorder'` is a preorder claim.
- Fallback is one-directional. A backorder request can consume shelf units, but a shelf request never consumes a claim.
- In the claim-first case, `taken` lists the claim line before the shelf line.
