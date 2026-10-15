---
source: src/modules/returns/tests/unit/refund-amount.test.ts
sha256: aa4223cede18d8bba6d413d5dd9f6c9f191c9cf040f0f323db3749f055144fd5
generated_at: 2026-10-15T12:01:58.078741+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/refund-amount.test.ts

## Purpose

Unit tests for the refund-amount domain module. Every calculation rule derived from the Consumer Rights Directive (Art. 13 and Art. 14) is exercised here: goods-line totals, shipping refund caps and exceptions, handling deductions, zero-decimal currencies, and the still-owed shipping guard. The file exists to pin down exact minor-unit arithmetic and the boundary/error conditions of the three exported functions.

## Key elements

- **`base`** (const) — shared `RefundInputs` fixture: 2 × 30 + 1 × 10 EUR, withdrawal reason, express shipping 15 vs. standard 5, `takesLastUnit: true`.
- **`totalOf`** (helper) — calls `refundAmountFor`, asserts `ok`, returns `breakdown.total`. Throws on failure so tests that *expect* a successful refund stay one-liners.
- **`describe('refundAmountFor — the goods')`** — verifies line-item sums and floating-point exactness (0.10 × 3 = 0.30).
- **`describe('refundAmountFor — the delivery (Art. 13(2))')`** — shipping refund rules: zero when not last unit; capped at cheapest standard for withdrawal; full amount for `defective` / `wrong_item`; zero when standard is free; goods + shipping additive total.
- **`describe('refundAmountFor — the handling deduction (Art. 14(2))')`** — deduction subtracted from total and reported in `breakdown`; floored at 0; `deduction-too-high` failure when it exceeds the refund.
- **`describe('refundAmountFor — currencies without a hundredth')`** — JPY whole-yen arithmetic.
- **`describe('refundAmountFor — the delivery still owed')`** — feeds `shippingStillOwed` result back into `refundAmountFor` to confirm the cap.
- **`describe('shippingStillOwed')`** — direct tests: paid − already-refunded, clamped at 0, minor-unit exactness.
- **`describe('cancellationRefundFor')`** — pre-delivery cancellation: goods only when other units remain; full shipping when it is the last unit (no standard cap); floating-point exactness.

## Relationships

- **`src/modules/returns/domain/refund-amount.ts`** — the sole import target. The test file exercises all three exported functions (`refundAmountFor`, `shippingStillOwed`, `cancellationRefundFor`) and the `RefundInputs` type. No other modules are referenced.

## Notes

- All monetary values are **minor units** (integers for EUR/JPY). The "0.10 three times" tests specifically guard against floating-point drift leaking into the domain.
- Tests that expect a *failure* result call `refundAmountFor` directly (and inspect `ok: false` + `reason`) rather than going through `totalOf`, which throws.
- Grouping follows legal article (Art. 13(2), Art. 14(2)) rather than function, so a regulatory change maps to one `describe` block.
- `deduction-too-high` is the literal `reason` string asserted on the failure variant — renaming it in the domain will break this test.
