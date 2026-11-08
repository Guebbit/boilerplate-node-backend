---
source: src/modules/returns/tests/unit/refund-amount.test.ts
sha256: f81084434d33281fac8e5f687eb85ef5ed0c8a878f9423fdcfb012c7083e932d
generated_at: 2026-11-08T08:13:13.062214+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/refund-amount.test.ts

## Purpose

Unit tests for the pure-arithmetic refund calculation in the returns domain module. Every rule derived from the Consumer Rights Directive (Art. 13 shipping, Art. 14 handling deduction) is pinned to an expected value, including edge cases around currency formatting and the interaction between earlier partial refunds and later returns.

## Key elements

- **`base`** – shared fixture: two shirts @ 30.00, one mug @ 10.00, 15.00 express paid, 5.00 standard, no handling deduction. Most tests spread and override a single field.
- **`totalOf(inputs)`** – helper that calls `refundAmountFor`, throws on `ok: false`, and returns `breakdown.total` as a string. Used when the test only cares about the grand total.
- **`describe('refundAmountFor — the goods')`** – asserts the goods line equals the sum of `quantity × unitPrice` and that string-based minor-unit math avoids float drift (0.10 × 3 = '0.30').
- **`describe('refundAmountFor — the delivery (Art. 13(2))')`** – covers: no shipping refund when not last unit; cap at cheapest standard for withdrawal; refund-as-paid when below standard; zero when standard is free; full shipping refund for `defective` / `wrong_item` (via `it.each`); and the goods + delivery sum.
- **`describe('refundAmountFor — the handling deduction (Art. 14(2))')`** – deduction subtracted from total; floor at '0.00'; `deduction-too-high` error when deduction exceeds the pre-deduction total.
- **`describe('refundAmountFor — currencies without a hundredth')`** – JPY case: result is `'2400'` (no decimal places) rather than `'2400.00'`.
- **`describe('refundAmountFor — the delivery still owed')`** – feeds `shippingStillOwed` output into `refundAmountFor` to verify the cap respects prior partial refunds.
- **`describe('shippingStillOwed')`** – direct tests: subtraction, zero-floor, exact minor-unit results.
- **`describe('cancellationRefundFor')`** – cancellation-specific path: no shipping cap when `takesLastUnit` is true (full 15.00 refunded); no shipping when other units remain; same float-safety check.

## Relationships

- **`src/modules/returns/domain/refund-amount.ts`** – the sole dependency. This test imports `refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed`, and the `RefundInputs` type. All assertions exercise the public API of that module; no other files are touched.

## Notes

- All monetary values are **strings** (e.g. `'30.00'`, `'2400'`), not numbers, to sidestep IEEE-754 drift. The JPY test confirms the formatter drops the decimal for zero-decimal currencies.
- `totalOf` throws on failure; tests that *expect* a failure (e.g. `deduction-too-high`) call `refundAmountFor` directly and assert the `{ ok: false, reason }` shape.
- `cancellationRefundFor` deliberately has **no shipping cap** (unlike `refundAmountFor`), because no goods were delivered in a pre-delivery cancellation. This asymmetry is the key behavioral distinction tested here.
- The module doc-comment states the intent explicitly: each Directive article is mapped to at least one case, so the tests double as the executable spec for Art. 13/14 logic.
