---
source: src/modules/inventory/domain/hold-lines.ts
sha256: a040bb8fa8f3d537018c32a2626c8d382b39b9a8a4f02183209457dd6ec33db5
generated_at: 2026-10-29T04:00:02.562077+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/hold-lines.ts

## Purpose

Pure arithmetic helpers for manipulating the line items of an inventory hold. It answers two questions without touching a database: "if I ship (or cancel) these lines, what is left and what came out?" (`takeFromHold`) and "if I add these lines on top, what does the hold name now?" (`withAdded`). Keeping the math in a standalone module makes it unit-testable in isolation.

## Key elements

- **`HoldLine`** (interface) — A single line on a hold: `productId`, `quantity`, and an optional `kind` (`'stock'` | `'backorder'`). Omitting `kind` means stock.
- **`HoldTake`** (interface) — The shape returned by `takeFromHold`: `remaining` lines still set aside and `taken` lines that actually came out.
- **`takeFromHold(items, lines)`** (exported) — Subtracts `lines` from `items` per product-and-kind, never below zero. A `backorder` line falls back to the same product's `stock` units for any shortfall. Returns the remaining and taken lines.
- **`withAdded(items, added)`** (exported) — Merges `added` onto `items` by product-and-kind, summing quantities. Preserves first-seen order; drops lines whose total hits zero.
- **`keyOf` / `takeOf`** (module-private) — Helpers that build the composite `productId|kind` key and perform a single bounded subtraction against a `Map`.

## Relationships

- **`./transitions`** — Imports the `HoldKind` type used by `HoldLine.kind`.
- **`./index.ts`** — Barrel file that re-exports this module's public API for consumers.
- **`services/holds.ts`** — Application service that calls `takeFromHold` when a shipment is fulfilled or a remainder is cancelled, passing the hold's persisted items and the outbound lines.
- **`services/top-up.ts`** — Application service that calls `withAdded` when re-reserving stock after a lost parcel.
- **`repository.ts`** — The persistence layer that supplies the `items` array these pure functions operate on; the functions themselves never read or write storage.
- **`tests/unit/hold-lines.test.ts`** — Dedicated unit tests exercising `takeFromHold` and `withAdded` edge cases.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Cross-module integration test that exercises hold-line arithmetic as part of a delivery fulfillment flow.

## Notes

- **Backorder fallback:** When a `backorder` line is taken, any quantity not covered by the backorder key is drawn from the same product's `stock` key. This prevents stock units from being stranded on a hold after its backorder claim is cancelled.
- **`kind` is omitted in output when it is stock.** `toLines` only sets `kind` on the returned object when it is `'backorder'`; stock lines carry no explicit `kind` field, matching the interface's optional default.
- **Inputs are treated as read-only.** Both exports accept `readonly HoldLine[]` and build internal `Map`s; the original arrays are never mutated.
- **Order preservation:** `withAdded` keeps lines in first-seen order (existing items before additions, within each group).
