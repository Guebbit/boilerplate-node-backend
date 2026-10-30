---
source: src/modules/returns/tests/unit/domain.test.ts
sha256: ebc6bb351ab9932d24541217d5eb9a828dc94a4141d3360786575d9ea591f8c9
generated_at: 2026-10-29T05:50:39.697338+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/domain.test.ts

## Purpose

Unit tests for the pure, database-free rules in the returns domain. They lock down the initial-status mapping, lifecycle status-set invariants, quantity arithmetic, line validation, remedy accounting, and minor-unit (integer-cent) money math so that every boundary condition is explicit and regression-safe.

## Key elements

- **`initialStatusFor`** – verifies that a withdrawal opens as `approved` while `defective` / `wrong_item` / `other` open as `requested`.
- **`the lifecycle sets`** – asserts the exact membership of `DECIDABLE_RETURN_STATUSES`, `RECEIVABLE_RETURN_STATUSES`, `CANCELABLE_RETURN_STATUSES`, `QUANTITY_HOLDING_RETURN_STATUSES`, and `BACK_RETURN_STATUSES`, and that `canceled` / `declined` appear in neither holding nor "goods-back" sets.
- **`wireLines`** – confirms object IDs (via `toString()`) are serialised to string-keyed lines with quantity preserved.
- **`returnableLinesOf`** – checks predicate-based filtering of order items into wire-format lines.
- **`quantitiesByProduct`** – verifies per-product summing across multiple lines, including the empty-input case.
- **`returnableQuantities`** – tests order-minus-earlier-returns subtraction, multi-line summing, and the floor-at-zero guard.
- **`checkRequestedLines`** – the largest suite; validates the full happy path, `nothing-returnable`, `too-many` (including duplicate-line aggregation), and `unknown-product` rejection.
- **`a replacement or a repair`** – confirms that `replace` / `repair` remedies do **not** hold goods or settle delivery, while `refund` does.
- **`holdsReturnedGoods`** – pins down which `(kind, status, remedy?)` tuples count as holding returned goods; cancellations and `declined` never do.
- **`takesLastUnit`** – verifies that the check is true only when *every* ordered unit of *every* ordered product is accounted for, and false otherwise.
- **`accountsOf`** – aggregation tests: which statuses contribute to `accountedFor`, shipping-refund summation, minor-unit (integer-cent) arithmetic to avoid float drift, and the empty-input case.

## Relationships

- **`src/modules/returns/domain/index.ts`** – the sole import target; all tested symbols (`initialStatusFor`, `wireLines`, `returnableLinesOf`, `quantitiesByProduct`, `returnableQuantities`, `checkRequestedLines`, `holdsReturnedGoods`, `takesLastUnit`, `accountsOf`, `reasonsOpenAt`, `resolveRestock`, `policyExceptionsOf`, `checkStatement`, and the status-set constants) are re-exported from here.
- **`src/modules/returns/domain/lifecycle.ts`** – source of the status-set constants (`DECIDABLE_RETURN_STATUSES`, `RECEIVABLE_RETURN_STATUSES`, `CANCELABLE_RETURN_STATUSES`, `QUANTITY_HOLDING_RETURN_STATUSES`, `BACK_RETURN_STATUSES`) and `initialStatusFor`.
- **`src/modules/returns/domain/quantities.ts`** – source of `wireLines`, `returnableLinesOf`, `quantitiesByProduct`, `returnableQuantities`, `checkRequestedLines`, `takesLastUnit`.
- **`src/modules/returns/domain/accounting.ts`** – source of `accountsOf` and `holdsReturnedGoods`.
- **`src/modules/returns/domain/reasons.ts`** – source of `reasonsOpenAt` (imported but not directly asserted in the visible tests).
- **`src/modules/returns/domain/restock.ts`** – source of `resolveRestock` (imported; not exercised in the visible test body).
- **`src/modules/returns/domain/statement.ts`** – source of `checkStatement`, `policyExceptionsOf` (imported; not exercised in the visible test body).

## Notes

- **Product IDs are objects, not strings.** Tests use an `id(value)` helper that returns `{ toString: () => value }`. Domain functions are expected to accept any object that stringifies to the ID; tests never pass a bare string.
- **Minor-unit arithmetic.** `accountsOf` tests with `0.1 + 0.2` assert an exact `0.3` result, confirming internal integer-cent math to prevent floating-point drift.
- **Duplicate-line aggregation in `checkRequestedLines`.** Two lines each requesting 1 unit of the same product are summed to 2 *before* the limit check—two 1s do not slip past a remaining-quantity of 1.
- **Remedy changes accounting semantics.** A `closed` return with remedy `replace` or `repair` neither holds goods nor refunds delivery; only `refund` (or absence of a remedy) does. This is tested explicitly against `accountsOf` output.
- **`canceled` is distinct from `declined`.** Both are excluded from `QUANTITY_HOLDING_RETURN_STATUSES` and `BACK_RETURN_STATUSES`, but `canceled` additionally implies the goods never shipped, so `holdsReturnedGoods` is false for any cancellation.
