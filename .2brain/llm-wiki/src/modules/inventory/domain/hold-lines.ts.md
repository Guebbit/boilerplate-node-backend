---
source: src/modules/inventory/domain/hold-lines.ts
source_sha256: 65b81b4054ee95c0c3c5553dedf07e455bae19db98fd4d4dc6168146959f38e3
context_sha256: 4a4d2669fa8d33a65e464a9e4de2f1d633d325aadb2c212d46b8555c8adf97ef
generated_at: 2026-11-22T05:18:10.527482+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/domain/hold-lines.ts

## Purpose
Pure arithmetic for changing the lines of an inventory hold: removing lines (partial shipment or remainder cancel) and adding lines (topping a hold up). It has no database access, so the logic can be unit tested in isolation.

## Key elements
- `HoldLine`: `{ productId, quantity, kind? }`. `kind` is a `HoldKind` (imported from `./transitions`); absent means `stock`. The same product can appear under both `stock` and `backorder` (preorder claim) kinds.
- `HoldTake`: result type of `takeFromHold`, with `remaining` (still held) and `taken` (what actually came out).
- `takeFromHold(items, lines)`: subtracts `lines` from `items`, per product and kind, never going below zero. Each line takes at most what the hold has, and `taken` reflects the real amounts so counters move by exactly that. Zero-quantity entries are omitted from both results.
- `withAdded(items, added)`: merges `added` lines into `items`, summing quantities for the same product and kind. It keeps first-seen order and drops lines with quantity <= 0.
- Internal helpers: `keyOf` builds the `productId|kind` key (kind defaults to `stock`). `takeOf` takes up to N from a keyed map and mutates both the held and taken maps.

## Relationships
- Imports the `HoldKind` type from `src/modules/inventory/domain/transitions.ts`.
- Other graph neighbors: `src/modules/inventory/domain/index.ts`, `src/modules/inventory/repository.ts`, `src/modules/inventory/services/holds.ts` and `src/modules/inventory/services/top-up.ts`. The doc comments describe the use cases as partial shipment, remainder cancel and topping up for a lost parcel. `takeFromHold` covers the first two and `withAdded` covers the last.
- Tested by `src/modules/inventory/tests/unit/hold-lines.test.ts`. `src/modules/delivery/tests/unit/fulfillment.test.ts` is also a neighbor.

## Notes
- For a line with `kind: 'backorder'`, `takeFromHold` takes from the preorder claim first. Any shortfall is then taken from the `stock` line of the same product. These are units already allocated to shelf stock that the fulfillment order has not yet heard about. This keeps a canceled remainder from leaving stranded units on a hold.
- `takeFromHold` is not symmetric for `stock` lines: they never fall back to a `backorder` claim.
- Output lines omit `kind` for `stock` and set it only for `backorder`. Keys are split on `|`, so a product ID containing `|` would be mis-parsed.
- `withAdded` does not filter its own inputs beyond the final `quantity > 0` check, and it can return the original line objects unchanged.
