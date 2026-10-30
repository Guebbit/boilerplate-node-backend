---
source: src/modules/returns/domain/quantities.ts
sha256: c5f5b5cbd3b75987006109e02e183981379678552ce85e3bb78b1d54a6a85e69
generated_at: 2026-10-29T05:37:40.695817+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/quantities.ts

## Purpose

Pure, side-effect-free functions that answer "how much of this order can still come back?" and "does this return consume the last unit?" They encode the business rules for returnable quantity, line validation, and whole-order completion so that services and domain projections can rely on them without touching a database.

## Key elements

- **`ProductQuantity`** — interface for a single line: `{ productId: string; quantity: number }`.
- **`wireLines`** — normalises heterogeneous line arrays (ObjectId or string IDs) into `ProductQuantity[]` with string keys.
- **`quantitiesByProduct`** — folds an array of lines into a `Map<string, number>` summing quantities per product.
- **`returnableLinesOf`** — given generic order items and an `isExcluded` predicate, returns the non-excluded lines as `ProductQuantity[]` (Art. 16 exclusion).
- **`returnableQuantities`** — subtracts already-returned lines from ordered lines; returns `Map<string, number>` clamped at zero.
- **`LinesVerdict`** — discriminated union: `{ ok: true; lines }` or `{ ok: false; reason: 'nothing-returnable' | 'unknown-product' | 'too-many' }`.
- **`checkRequestedLines`** — validates a customer's requested lines against remaining quantities; `undefined`/empty request means "take everything still returnable."
- **`takesLastUnit`** — returns `true` when the supplied lines account for every ordered unit per product (used to decide whether a refund covers shipping).

## Relationships

- **`src/modules/returns/domain/index.ts`** — barrel file; re-exports the public API of this module for the rest of the domain.
- **`src/modules/returns/services/create.ts`**, **`src/modules/returns/services/receive.ts`** — call `checkRequestedLines` to freeze the final line set for a return.
- **`src/modules/returns/services/cancel-remainder.ts`**, **`src/modules/returns/services/cancel-right.ts`** — use `returnableQuantities` / `takesLastUnit` to compute what a cancellation covers and whether it closes the order.
- **`src/modules/returns/services/cancellation-refund.ts`** — relies on `takesLastUnit` to determine whether shipping is refunded by this cancellation.
- **`src/modules/returns/services/projection.ts`**, **`src/modules/returns/services/options.ts`**, **`src/modules/returns/services/outcome.ts`** — consume `returnableQuantities` or `returnableLinesOf` to project or present returnable state.
- **`src/modules/returns/domain/status-projection.ts`** — domain-level sibling that composes these quantity results into a status view.
- **`src/modules/returns/domain/accounting.ts`** — sibling domain module handling the monetary side; this module supplies the quantity inputs it needs.
- **`src/modules/returns/tests/unit/domain.test.ts`** — unit-tests every exported function in this file.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — exercises `takesLastUnit` (or its callers) in the context of delivery/fulfilment scenarios.

## Notes

- All product IDs are **stringified** at the boundary (`wireLines`, `returnableLinesOf`). Downstream code should only ever see `string` IDs; the `ProductIdLike` interface exists solely to accept `ObjectId`-shaped values at the entry point.
- `returnableQuantities` clamps at **zero** via `Math.max(0, …)`; it never returns negative numbers. Callers must not rely on a negative value to signal over-return.
- `checkRequestedLines` treats `undefined` and `[]` identically ("take all that remains"). A non-empty request that sums to zero per product still enters the explicit-validation branch.
- `takesLastUnit` compares against **ordered** quantity, not returnable quantity. A product excluded under Art. 16 therefore prevents the order from ever being "whole," which is intentional.
- The module is intentionally free of imports beyond its own interfaces — no database, no services, no side effects — making it trivially unit-testable and safe to import anywhere.
