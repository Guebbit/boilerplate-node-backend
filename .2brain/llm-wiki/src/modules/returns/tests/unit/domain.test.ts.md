---
source: src/modules/returns/tests/unit/domain.test.ts
sha256: 2f13aa180788a681b85d5216a87adf2f66db4608a182ec4fd65d36f992a6b681
generated_at: 2026-10-15T12:01:26.508017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/domain.test.ts

## Purpose

Unit tests for the pure, database-free rules in the returns domain module. It verifies the status-transition invariants, quantity arithmetic, line validation, and accounting aggregation without any external infrastructure, so the domain logic can be reasoned about and regression-tested in isolation.

## Key elements

- **`initialStatusFor` tests** — Asserts that withdrawals open as `'approved'` while reason-based returns (`defective`, `wrong_item`, `other`) open as `'requested'`.
- **Lifecycle-set tests** — Pin the membership of `DECIDABLE_RETURN_STATUSES` (`['requested']`), `RECEIVABLE_RETURN_STATUSES` (`['approved']`), and `QUANTITY_HOLDING_RETURN_STATUSES` (includes `requested`/`approved`/`received`/`closed`, excludes `declined`).
- **`wireLines` tests** — Confirms product IDs are coerced via `.toString()` and quantities are preserved.
- **`returnableLinesOf` tests** — Verifies a boolean predicate filters order items and the surviving lines are keyed by string ID.
- **`returnableQuantities` tests** — Checks subtraction of prior returns, summation of duplicate product lines, and the floor-at-zero guard.
- **`checkRequestedLines` tests** — Covers the full validation matrix: no-lines (take-all), empty-list equivalence, nothing-remaining, exact-fit, over-request (`too-many`), unknown product, zero-remaining product, and the "same product named twice must be summed before comparison" edge case.
- **`holdsReturnedGoods` tests** — Confirms every status in `QUANTITY_HOLDING_RETURN_STATUSES` counts, `declined` does not, and cancellations never count regardless of status.
- **`takesLastUnit` tests** — Asserts the result is `true` only when *every* ordered unit is accounted for; partial coverage, zero-quantity entries, or products never referenced keep it `false`.
- **`accountsOf` tests** — Validates that `accountedFor` includes only settled goods (cancellation `closed`, return `received`), excludes in-flight (`approved`) and `declined`; `shippingRefunded` sums only settled entries; and arithmetic is done in minor units (0.1 + 0.2 → 0.3, not 0.30000000000000004).
- **`BACK_RETURN_STATUSES` test** — Pins the constant to `['received', 'closed']`.
- **`id` helper (local)** — Small factory returning `{ toString: () => value }` to simulate the MongoDB-style ObjectId interface the domain expects.

## Relationships

- **`src/modules/returns/domain/index.ts`** — The sole import target; every symbol under test (`initialStatusFor`, `wireLines`, `returnableLinesOf`, `returnableQuantities`, `checkRequestedLines`, `holdsReturnedGoods`, `takesLastUnit`, `accountsOf`, and the four status-set constants) is re-exported from this barrel.
- **`src/modules/returns/domain/lifecycle.ts`** — Source of the status-set constants and `initialStatusFor`; the lifecycle-set tests directly assert its invariants.
- **`src/modules/returns/domain/quantities.ts`** — Source of `wireLines`, `returnableLinesOf`, `returnableQuantities`, `checkRequestedLines`, `takesLastUnit`, and `holdsReturnedGoods`.
- **`src/modules/returns/domain/accounting.ts`** — Source of `accountsOf` and `BACK_RETURN_STATUSES`; the accounting tests exercise its settlement filtering and minor-unit summation.

## Notes

- Product IDs are exercised exclusively through a `.toString()` object (the local `id` helper or inline `{ toString: () => '…' }`), mirroring how the domain layer handles Mongo ObjectIds. Tests do not use raw string IDs for inputs that go through `wireLines` or `returnableLinesOf`.
- The `accountsOf` "minor units" test (0.1 + 0.2) is a deliberate guard against floating-point drift; if the implementation switches to integer-cents arithmetic the test should still pass but is there to catch a regression to naive `parseFloat` addition.
- `checkRequestedLines` with `undefined` and `[]` are tested as equivalent ("treats an empty list like no list") — callers may safely pass either.
- `takesLastUnit` compares against the *ordered* quantity, not the returned quantity; the test with product `'c'` (never in the ordered list) existing in the accounted list confirms extra products don't accidentally satisfy the check.
