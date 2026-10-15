---
source: src/modules/returns/domain/refund-amount.ts
sha256: 5d9e09483fd82493738c81d957a16052ca5dc5d313b21ecf49019417c4bcdc01
generated_at: 2026-10-15T11:53:01.167238+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/refund-amount.ts

## Purpose

Pure-arithmetic module that computes what a received return (or a remainder cancellation) owes the customer, working exclusively in integer minor units so the quoted figure and the payment wire can never diverge by float drift. It encodes the shipping-refund rule (only the last unit of an order refunds delivery; withdrawal is capped at cheapest standard, defective/wrong-item refunds full shipping, cancellation refunds all shipping) and the handling-deduction guard.

## Key elements

- **`RefundInputs`** — input shape for a received return: currency, reason, line items, `takesLastUnit`, `shippingPaid`, `cheapestStandardShipping`, `handlingDeduction`.
- **`RefundBreakdown`** — output shape: `goods`, `shipping`, `deduction`, `total` (all in decimal units for wire/ledger).
- **`RefundVerdict`** — discriminated union: `{ ok: true; breakdown }` or `{ ok: false; reason: 'deduction-too-high' }`.
- **`refundAmountFor(inputs): RefundVerdict`** — main entry for a received return. Sums line goods, computes refundable shipping, subtracts handling deduction; rejects if the deduction would drive the total negative.
- **`refundableShipping(inputs): Money`** *(module-private)* — returns 0 unless `takesLastUnit`; for defective/wrong-item returns full `shippingPaid`; for withdrawal caps at `cheapestStandardShipping`.
- **`CancellationInputs`** — input shape for a remainder cancellation (no reason, no cheapest-shipping, no deduction).
- **`cancellationRefundFor(inputs): RefundBreakdown`** — computes cancellation refund: line goods + full shipping when `takesLastUnit` (no cap, no deduction, since nothing was delivered).
- **`shippingStillOwed(currency, shippingPaid, alreadyRefunded): number`** — helper that returns `max(0, paid − refunded)` in decimal units; the guard preventing double-refunding of delivery.

## Relationships

- **`./lifecycle.ts`** — provides the `ReturnReason` type consumed by `RefundInputs.reason`.
- **`@shared-kernel/money.ts`** — supplies `toMinorUnits`, `toDecimalAmount`, and the `Money` branded type; all arithmetic in this file goes through these helpers.
- **`./index.ts`** — barrel file that re-exports the public API of this module (`refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed`, and the interfaces/types) to the rest of the returns module.
- **`services/receive.ts`** — the receive-return service that calls `refundAmountFor` and `shippingStillOwed` when processing an incoming return.
- **`services/cancellation-refund.ts`** — the cancellation service that calls `cancellationRefundFor` and `shippingStillOwed` when cancelling the remainder of an order.
- **`tests/unit/refund-amount.test.ts`** — unit tests covering the arithmetic, shipping-cap logic, and the `deduction-too-high` rejection path.

## Notes

- **`takesLastUnit` is a caller-supplied flag**, not something this module derives. The services are responsible for determining whether all other units are already gone; a mis-set flag silently changes the shipping component.
- **Cancellation always refunds full shipping** (when last unit) with no cheapest-standard cap, because the legal rationale for the cap (delivery actually occurred) does not apply to a pre-dispatch cancel.
- **The only failure mode is `deduction-too-high`.** Callers must branch on `RefundVerdict.ok`; there is no thrown error.
- **All public return values are in decimal units** (e.g., 19.99), while internal arithmetic stays in minor units (1999). The `Money` type is a branded number used only at the `toMinorUnits`/`toDecimalAmount` boundary.
- **Line prices are "gross unit price the order froze"** — this module does no tax, discount, or currency conversion; it trusts the caller to pass the final per-unit figure.
