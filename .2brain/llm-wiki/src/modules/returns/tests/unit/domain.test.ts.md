---
source: src/modules/returns/tests/unit/domain.test.ts
sha256: 5c35209827ac179751233841dfe814e0096a14dbcd19d0dbf55d3c0310addd3f
generated_at: 2026-11-08T08:12:38.713336+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/domain.test.ts

## Purpose

Unit tests for the pure domain rules that decide a return's line items, initial status, quantity accounting, and reason eligibility. Because the domain is database-free, these tests walk every boundary condition in isolation, ensuring the business logic stays correct without a running service.

## Key elements

- **`initialStatusFor` tests** – Verify that a withdrawal opens as `approved` while all other reasons (`defective`, `wrong_item`, `other`) open as `requested`.
- **`wireLines` tests** – Confirm product IDs are coerced to strings via `.toString()` and quantities are preserved.
- **`returnableLinesOf` tests** – Check that a predicate filters out non-returnable items and the remainder is keyed by string ID.
- **`quantitiesByProduct` tests** – Assert per-product summation across multiple lines and the empty-input edge case.
- **`returnableQuantities` tests** – Verify subtraction of already-returned quantities, multi-line summation, and the floor at zero.
- **`checkRequestedLines` tests** – Cover the full matrix: no-list default, empty-list equivalence, zero-remaining rejection, exact-match acceptance, over-request rejection, unknown-product rejection, and duplicate-line aggregation before comparison.
- **`holdsReturnedGoods` tests** – Confirm remediation type (`replace`/`repair` vs. `refund`), status-based holding, and that cancellations never hold goods.
- **`takesLastUnit` tests** – Assert the "every ordered unit is accounted for" predicate, including that it is evaluated against the *ordered* quantity and is false for any unaccounted product.
- **`accountsOf` tests** – Verify which statuses count as settled (`received`, `closed`), that cancellations contribute to `accountedFor`, shipping-refund summation in minor units, and the empty-input shape.
- **`reasonsOpenAt` tests** – Check deadline filtering (withdrawal vs. conformity periods) and that the deadline instant itself is treated as still open.
- **`resolveRestock` tests** (truncated) – Begin exercising restock resolution against returned lines.

## Relationships

- **`src/modules/returns/domain/index.ts`** – The sole import source (`from '../../domain'`); this barrel re-exports every function and constant under test.
- **`src/modules/returns/domain/lifecycle.ts`** – Source of `initialStatusFor`, `BACK_RETURN_STATUSES`, `QUANTITY_HOLDING_RETURN_STATUSES`, and `holdsReturnedGoods` (status/remedy logic).
- **`src/modules/returns/domain/quantities.ts`** – Source of `wireLines`, `returnableLinesOf`, `quantitiesByProduct`, `returnableQuantities`, `checkRequestedLines`, `takesLastUnit` (line/quantity math).
- **`src/modules/returns/domain/accounting.ts`** – Source of `accountsOf` (settled-unit and shipping-refund accounting).
- **`src/modules/returns/domain/reasons.ts`** – Source of `reasonsOpenAt` (deadline-based reason eligibility).
- **`src/modules/returns/domain/restock.ts`** – Source of `resolveRestock` (restock line resolution).

## Notes

- Product IDs are never plain strings in fixtures; the helper `id(value)` returns `{ toString: () => value }` to mirror how the domain accepts any object that stringifies to the ID. Tests assert the *output* uses the string form.
- `checkRequestedLines` is expected to **aggregate duplicate product lines before** comparing against the remaining quantity—a subtle invariant pinned by the "two ones are not a way past a limit of one" test.
- `accountsOf` sums shipping refunds in **minor units** (integer cents) to avoid floating-point drift; tests use two-decimal string inputs and assert exact string outputs.
- `reasonsOpenAt` treats the deadline instant as **inclusive** (still open); tests pin this with `withdrawUntil: NOW` / `conformityUntil: NOW`.
- The file imports `policyExceptionsOf` and `checkStatement` from the barrel but no `describe` blocks for them appear in the visible portion—either they are tested in a separate file or the section was truncated.
- `BACK_RETURN_STATUSES` is asserted directly as `['received', 'closed']`, making this test file the de facto documentation of which statuses are considered "goods are back."
