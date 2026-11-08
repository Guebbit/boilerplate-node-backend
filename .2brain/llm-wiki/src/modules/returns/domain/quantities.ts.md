---
source: src/modules/returns/domain/quantities.ts
sha256: 509184157ab0fc40122c2af7e596e7712491d654d1ba63f1ebf616b4b121f13b
generated_at: 2026-11-08T07:57:57.165598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/quantities.ts

## Purpose

Pure domain logic that answers "how much of an order can still come back?" and validates a return's requested lines against that remaining pool. It exists as a database-free layer so the quantity rules that decide a return's lines are unit-testable in isolation.

## Key elements

- **`ProductQuantity`** – Core record shape: `{ productId: string; quantity: number }`. Used by every function in the file.
- **`wireLines(lines)`** – Normalises an array of lines whose `productId` may be an `ObjectId` or other `ProductIdLike` into plain `ProductQuantity[]` with string ids.
- **`quantitiesByProduct(lines)`** – Collapses multiple lines for the same product into a single `Map<string, number>` of summed units.
- **`returnableLinesOf(items, isExcluded)`** – Filters an order's items through a caller-supplied predicate (Art. 16 exclusions) and maps the survivors to `ProductQuantity[]`.
- **`returnableQuantities(ordered, alreadyReturned)`** – Subtracts already-returned units from ordered units per product; clamps at zero. Returns `Map<string, number>`.
- **`checkRequestedLines(remaining, requested)`** – The main validation gate. If `requested` is `undefined`/empty, returns "everything still left." Otherwise verifies every requested product exists in `remaining` and the summed quantity doesn't exceed it. Returns a discriminated `LinesVerdict`.
- **`LinesVerdict`** – `{ ok: true; lines } | { ok: false; reason: 'nothing-returnable' | 'unknown-product' | 'too-many' }`.
- **`takesLastUnit(ordered, accountedFor)`** – True when `accountedFor` covers **every** ordered unit of every product. Powers the "shipping refunded by whichever act takes the last unit" rule.

## Relationships

- **`domain/index.ts`** – Barrel file; re-exports the symbols above so services import from the module path rather than a deep path.
- **`domain/accounting.ts`** – Sibling domain module; likely consumes `ProductQuantity` / `quantitiesByProduct` for monetary calculations.
- **`domain/status-projection.ts`** – Sibling domain module; may use `takesLastUnit` to derive status transitions.
- **`services/create.ts`** – Return-creation flow; calls `returnableQuantities`, `checkRequestedLines`, and `wireLines` to freeze lines.
- **`services/cancel-remainder.ts`**, **`services/cancel-right.ts`** – Cancellation services; consume `returnableQuantities` / `checkRequestedLines` to determine what can still be canceled.
- **`services/cancellation-refund.ts`** – Refund service; uses `takesLastUnit` to decide whether shipping is refunded.
- **`services/options.ts`** – Builds available return options; likely calls `returnableLinesOf` with the exclusion predicate.
- **`services/outcome.ts`**, **`services/projection.ts`**, **`services/receive.ts`** – Downstream services that read or project quantity state produced here.
- **`tests/unit/domain.test.ts`** – Unit tests exercising the pure functions in this file.
- **`delivery/tests/unit/fulfillment.test.ts`** – Cross-module test that imports `ProductQuantity` or `takesLastUnit` to assert delivery-side invariants.

## Notes

- **Id normalisation is the convention.** Every function that accepts or produces product ids treats them as `string`. `wireLines` / `returnableLinesOf` call `String()` at the boundary; downstream code should never compare ids as `ObjectId` instances.
- **`takesLastUnit` is deliberately strict against ordered quantity.** An excluded line (Art. 16) means that product's ordered count can never be fully accounted for, so the order never "completes" from the shipping-refund perspective. This is intentional, not a bug.
- **`checkRequestedLines` deduplicates the caller's lines** via `quantitiesByProduct` before validating, so a product named on two requested lines is treated as one summed line.
- **Quantities never go negative.** `returnableQuantities` clamps with `Math.max(0, …)`; callers can rely on the map containing only non-negative values.
- **The module is pure by design** (no I/O, no DB). Keep it that way; any service-side side-effect belongs in `services/`.
