---
source: src/modules/returns/domain/quantities.ts
sha256: 07f1cabb78cb75b779ab3b5df67d59e5c0e913a75180b1632503b1780dda4c64
generated_at: 2026-11-14T21:33:46.932257+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/quantities.ts

## Purpose

Pure, database-free arithmetic for "how much of an order can still come back." It defines the quantity types, the summation/subtraction helpers, and the validation rule (`checkRequestedLines`) that decides which lines a return actually freezes, so the eligibility logic is unit-testable without a data layer.

## Key elements

- **`ProductQuantity`** – `{ productId: string; quantity: number }`; the canonical line shape used throughout the domain.
- **`wireLines`** – Normalises an array of lines (whose `productId` may be an `ObjectId` or any `toString()`-able value) into `ProductQuantity[]` with string IDs, enabling safe equality checks.
- **`quantitiesByProduct`** – Sums multiple lines into a `Map<string, number>` so the same product across several lines is counted once.
- **`returnableLinesOf`** – Filters order items through an `isExcluded` predicate (Art. 16 excluded goods) and maps the survivors to `ProductQuantity[]`.
- **`returnableQuantities`** – Subtracts `alreadyReturned` from `ordered` (both already `ProductQuantity[]`), flooring every entry at 0; returns a `Map<string, number>`.
- **`LinesVerdict`** – Discriminated union: either `{ ok: true; lines }` or `{ ok: false; reason: 'nothing-returnable' | 'unknown-product' | 'too-many' }`.
- **`checkRequestedLines`** – Validates a customer's requested lines (or the "take everything left" shorthand when the argument is `undefined`/empty) against the `remaining` map; returns a `LinesVerdict`.
- **`takesLastUnit`** – Boolean check: does `accountedFor` cover every unit of `ordered` per product? Used to decide which act (cancel or return) triggers the shipping refund.

## Relationships

- **`src/modules/returns/domain/index.ts`** – Barrel file that re-exports the public symbols from this module for the rest of the returns domain.
- **`src/modules/returns/domain/accounting.ts`** – Sibling domain module with its own "what remains" computation. The `checkRequestedLines` doc note explicitly says the two are "alike on purpose" and "free to diverge," so do not assume they share helpers.
- **`src/modules/returns/domain/status-projection.ts`** – Consumes quantity results when projecting a return's status.
- **`src/modules/returns/services/create.ts`**, **`src/modules/returns/services/options.ts`**, **`src/modules/returns/services/outcome.ts`**, **`src/modules/returns/services/projection.ts`**, **`src/modules/returns/services/proof.ts`**, **`src/modules/returns/services/receive.ts`** – Return-creation and lifecycle services that call into the pure functions here to compute and validate lines.
- **`src/modules/returns/services/cancel-remainder.ts`**, **`src/modules/returns/services/cancel-right.ts`**, **`src/modules/returns/services/cancellation-refund.ts`** – Cancellation-side services that rely on `takesLastUnit` to determine whether the last unit is being accounted for.
- **`src/modules/returns/tests/unit/domain.test.ts`** – Unit tests exercising the pure functions in this file.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** – Cross-module test that validates quantity logic at the delivery/fulfillment boundary.

## Notes

- **`wireLines` exists for a specific reason:** a stored `ObjectId` and a request's plain string must compare equal downstream. Always run lines through `wireLines` (or `returnableLinesOf`) before passing them to the comparison helpers.
- **`returnableQuantities` never goes negative** — each subtraction is floored with `Math.max(0, …)`. Callers can rely on non-negative values.
- **`checkRequestedLines` treats `undefined` and `[]` identically** ("take everything remaining"). The common "withdraw from the whole order" path passes no lines.
- **`takesLastUnit` counts against *ordered* quantity, not *returnable* quantity.** A product excluded under Art. 16 keeps the order from ever being "whole," which is intentional: the shipping refund for that order is then governed by the cancellation path, not the return path.
- The module is deliberately self-contained (no imports from other domain files). If you need shared quantity logic, check whether `src/modules/returns/domain/accounting.ts` already covers it before adding a new helper here.
