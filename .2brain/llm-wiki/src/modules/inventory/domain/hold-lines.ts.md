---
source: src/modules/inventory/domain/hold-lines.ts
sha256: 65b81b4054ee95c0c3c5553dedf07e455bae19db98fd4d4dc6168146959f38e3
generated_at: 2026-11-08T05:58:27.273336+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/hold-lines.ts

## Purpose

Pure arithmetic for mutating a hold's line items: subtracting lines (partial shipment or remainder cancel) and adding lines (topping a hold up after a lost parcel). Keeping the math free of I/O makes it directly unit-testable.

## Key elements

- **`HoldLine`** — `{ productId, quantity, kind? }`. `kind` distinguishes shelf units from preorder claims; absent means `stock`.
- **`HoldTake`** — `{ remaining, taken }`; the two sides of a subtraction.
- **`takeFromHold(items, lines)`** — Subtracts `lines` from `items` per product-and-kind, never below zero. A `backorder` line first draws from its own kind; any shortfall is covered by `stock` units of the same product (preorder claim falling back to already-allocated shelf units).
- **`withAdded(items, added)`** — Merges `added` into `items` per product-and-kind, summing quantities; filters out zero-quantity lines.
- **`keyOf`** (internal) — Builds the `"productId|kind"` map key; defaults `kind` to `'stock'`.
- **`takeOf`** (internal) — Single-key subtraction with mutation of the held/taken maps.

## Relationships

- **`./transitions`** — Imports the `HoldKind` type (at minimum `'stock' | 'backorder'`) used to distinguish line kinds.
- **`./index`** — Re-exports the public surface of this module for consumers within the inventory domain.
- **`services/holds.ts`** — Calls `takeFromHold` when a shipment or cancel removes lines from a persisted hold.
- **`services/top-up.ts`** — Calls `withAdded` to grow a hold when a parcel is re-issued.
- **`repository.ts`** — Persists the `HoldLine[]` arrays that `takeFromHold` / `withAdded` produce; this file itself performs no I/O.
- **`tests/unit/hold-lines.test.ts`** — Direct unit tests for the pure functions in this file.
- **`delivery/tests/unit/fulfillment.test.ts`** — Exercises `takeFromHold` in the context of a fulfillment flow.

## Notes

- The `kind` field is **omitted** (not set to `undefined`) for `stock` lines in the output of `toLines`; only `backorder` is explicitly set. Consumers should treat absence as `stock`.
- The backorder→stock fallback in `takeFromHold` is intentional: a canceled preorder remainder must not strand already-allocated shelf units on the hold. The `claimed` variable tracks how many units the backorder key actually covered before the stock fallback fires.
- `withAdded` preserves first-seen order of keys (Map insertion order), so the resulting array is deterministic for a given input order.
- All inputs are `readonly`; the functions never mutate their arguments.
