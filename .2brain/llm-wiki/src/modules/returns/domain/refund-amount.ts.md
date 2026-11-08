---
source: src/modules/returns/domain/refund-amount.ts
sha256: 38811ba931521248e1be1f53210e6e4890c1c74baa5c35d7d97c5f90baec62c1
generated_at: 2026-11-08T07:58:24.784373+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/refund-amount.ts

## Purpose

Pure arithmetic (integer minor units via `Money`) that computes what a customer is owed when a return is received or a fulfillment order is canceled. Keeps the quoted figure and the `payments` figure identical by avoiding any float math. Encodes the shipping-refund rules tied to Art. 13(2): only the entity that takes the last unit of the order refunds delivery, and the amount depends on the reason.

## Key elements

- **`RefundInputs`** — interface bundling currency, reason, returned lines, `takesLastUnit`, `shippingPaid`, `cheapestStandardShipping`, and `handlingDeduction`.
- **`RefundBreakdown`** — output shape: `goods`, `shipping`, `deduction`, `total` as decimal strings.
- **`RefundVerdict`** — discriminated union: `{ ok: true; breakdown }` or `{ ok: false; reason: 'deduction-too-high' }`.
- **`refundAmountFor`** (exported) — main return-refund calculator. Sums line goods, applies reason-based shipping refund, subtracts handling deduction; rejects if the deduction exceeds goods + shipping.
- **`CancellationInputs`** — interface for pre-dispatch cancellation (no deduction field).
- **`cancellationRefundFor`** (exported) — cancellation refund: canceled lines + full remaining shipping if `takesLastUnit`; no handling deduction.
- **`shippingStillOwed`** (exported) — returns the portion of paid shipping not yet refunded (clamped at zero), as a decimal string.
- **`goodsOf`** (module-internal) — multiplies each line's frozen unit price by quantity and sums.
- **`refundableShipping`** (module-internal) — zero unless `takesLastUnit`; `defective`/`wrong_item` → full `shippingPaid`; other reasons → `min(shippingPaid, cheapestStandardShipping)`.

## Relationships

- **`src/domain-primitives/money.ts`** — sole source of the `Money` type and all arithmetic helpers (`addMoney`, `subtractMoney`, `scaleMoney`, `minMoney`, `NO_MONEY`, `toMinorUnits`, `toDecimalString`).
- **`src/modules/returns/domain/lifecycle.ts`** — provides the `ReturnReason` type consumed by `RefundInputs` and the shipping-refund branch logic.
- **`src/modules/returns/domain/index.ts`** — barrel re-export for the domain layer.
- **`src/modules/returns/services/receive.ts`** — calls `refundAmountFor` when processing a received return.
- **`src/modules/returns/services/cancellation-refund.ts`** — calls `cancellationRefundFor` and `shippingStillOwed` during cancellation.
- **`src/modules/returns/tests/unit/refund-amount.test.ts`** — unit tests for every exported function.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — exercises shipping-refund interaction at the delivery/fulfillment boundary.

## Notes

- All monetary values cross module boundaries as **decimal strings** (e.g. `"12.50"`); `Money` (integer minor units) is internal to the calculation.
- `takesLastUnit` is the single flag that gates any shipping refund — partial returns/cancels always refund zero shipping regardless of reason.
- The `deduction-too-high` guard fires before any subtraction, so a refund can never go negative.
- `shippingStillOwed` uses `Math.max(owed, NO_MONEY)` with an `as Money` cast because `Math.max` erases the generic type.
- Cancellation deliberately has **no** `handlingDeduction` input — nothing is physically returned, so Art. 14(2) does not apply.
