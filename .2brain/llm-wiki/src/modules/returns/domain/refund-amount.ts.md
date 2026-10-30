---
source: src/modules/returns/domain/refund-amount.ts
sha256: b1af068a005a405c96eef2f8d472318ba3356b716ce497e2d8b2541d4325bb7e
generated_at: 2026-10-29T05:38:05.958519+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/refund-amount.ts

## Purpose

Pure arithmetic for computing how much a customer is owed when a return or cancellation is processed. All calculations use integer minor units (via the `Money` primitive) to eliminate float drift between the quoted figure and the payment sent. Encodes the shipping-refund rule: only the return/cancel that takes the last unit of an order refunds delivery, with the amount depending on reason (full refund for defects, cheapest-standard cap for withdrawals).

## Key elements

- **`refundAmountFor(inputs: RefundInputs): RefundVerdict`** — Main entry point. Sums returned-line goods, adds refundable shipping (if this is the last unit), subtracts the handling deduction. Returns a `RefundBreakdown` or rejects with `'deduction-too-high'` when the deduction would exceed goods + shipping (a refund cannot be negative).
- **`cancellationRefundFor(inputs: CancellationInputs): RefundBreakdown`** — Computes the refund for cancelling a fulfillment order's remainder. No handling deduction applies. If the cancel takes the last unit, the full remaining `shippingPaid` is refunded (no cheapest-standard cap, since nothing was delivered).
- **`shippingStillOwed(currency, shippingPaid, alreadyRefunded): number`** — Helper that computes the delivery still owed back (paid minus already refunded), floored at zero. Prevents double-refunding shipping across multiple partial returns/cancels.
- **`RefundInputs`** — Input contract: currency, reason, line items (quantity + frozen unit price), `takesLastUnit` flag, `shippingPaid`, `cheapestStandardShipping`, `handlingDeduction`.
- **`RefundVerdict`** — Discriminated union: `{ ok: true; breakdown }` | `{ ok: false; reason: 'deduction-too-high' }`.
- **`RefundBreakdown`** — `{ goods, shipping, deduction, total }` in decimal (wire/ledger) units.
- **`CancellationInputs`** — Subset of `RefundInputs` without reason or deduction fields.
- Internal `goodsOf` — multiplies each line's unit price by quantity and sums.
- Internal `refundableShipping` — applies the last-unit gate and reason-based cap.

## Relationships

- **`src/domain-primitives/money.ts`** — Consumes `addMoney`, `subtractMoney`, `scaleMoney`, `minMoney`, `NO_MONEY`, `toMinorUnits`, `toDecimalAmount`, and the `Money` type. All arithmetic flows through these to stay in integer minor units.
- **`src/modules/returns/domain/lifecycle.ts`** — Imports `ReturnReason` (used to select the shipping-refund strategy: full vs. cheapest-standard cap).
- **`src/modules/returns/domain/index.ts`** — Re-exports the public API of this module.
- **`src/modules/returns/services/cancellation-refund.ts`** — Calls `cancellationRefundFor` and `shippingStillOwed` to build the refund payload for a cancellation.
- **`src/modules/returns/services/receive.ts`** — Calls `refundAmountFor` and `shippingStillOwed` when processing a received return.
- **`src/modules/returns/tests/unit/refund-amount.test.ts`** — Unit tests for both public functions and the `shippingStillOwed` helper.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Integration-level test that exercises refund calculation through the fulfillment domain (touches this module's output via service calls).

## Notes

- All public return values (`RefundBreakdown`) are in **decimal** units (e.g. `12.34`), not minor units. Internal arithmetic stays in minor units via `Money`; conversion to decimal happens only at the boundary via `toDecimalAmount`.
- `takesLastUnit` is the single gate for shipping. Callers (the services) are responsible for determining and passing this flag correctly; this module does not query order state.
- The `as Money` cast in `shippingStillOwed` is safe because both operands of `Math.max` are `Money` values, but it exists solely to satisfy the type system around `Math.max`.
- `cancellationRefundFor` always sets `deduction: 0` — there is no path for a handling deduction on a cancel.
