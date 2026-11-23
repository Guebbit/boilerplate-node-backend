---
source: src/modules/returns/domain/refund-amount.ts
source_sha256: 586ccf4fab53dc5db176e5c901563e10432bb3eeeb872536a0488aa7eaf30465
context_sha256: feb93dd53724c94ba97c1555e4220ef76bcf99485c5948f09370206a5c2a7da3
generated_at: 2026-11-22T07:23:54.713019+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/refund-amount.ts

## Purpose
Pure arithmetic that computes what a received return, or a canceled remainder of a fulfillment order, is owed. All math is done in integer minor units, so the amount quoted to a customer and the amount `payments` sends cannot differ through float drift. Results are returned as decimal strings for the wire and the ledger.

## Key elements
- `RefundInputs`: input for a return. It holds the currency, the `reason`, the returned lines (quantity and frozen gross unit price), `takesLastUnit`, `shippingPaid`, `cheapestStandardShipping` and `handlingDeduction`.
- `RefundBreakdown`: the result, as decimal strings `goods`, `shipping`, `deduction` and `total`.
- `RefundVerdict`: either `{ ok: true, breakdown }` or `{ ok: false, reason: 'deduction-too-high' }`.
- `refundAmountFor(inputs)`: computes goods + refundable shipping − deduction. It returns `deduction-too-high` if the deduction exceeds goods plus shipping, because a refund cannot be negative.
- `CancellationInputs`: input for a remainder cancel. It is like `RefundInputs` but has no reason, no cheapest-shipping value and no deduction.
- `cancellationRefundFor(inputs)`: refunds the canceled lines plus all the remaining delivery when the cancel takes the last unit. The deduction is always zero. It returns a `RefundBreakdown` directly and has no failure case.
- `shippingStillOwed(currency, shippingPaid, alreadyRefunded)`: returns shipping paid minus shipping already refunded, floored at zero, as a decimal string. It guards against refunding delivery twice.
- Internal helpers: `goodsOf` sums quantity × frozen unit price over the lines. `refundableShipping` implements the shipping rules below.

## Relationships
- Imports `addMoney`, `minMoney`, `NO_MONEY`, `scaleMoney`, `subtractMoney`, `toDecimalString`, `toMinorUnits` and the `Money` type from `src/domain-primitives/money.ts`.
- Imports the `ReturnReason` type from `lifecycle.ts`.
- `src/modules/returns/domain/index.ts` sits next to it in the dependency graph. The file does not show what it re-exports.
- `src/modules/returns/services/receive.ts` and `src/modules/returns/services/cancellation-refund.ts` are graph neighbors. They presumably call the return and cancel calculations respectively, but the file itself doesn't show this.
- `src/modules/returns/tests/unit/refund-amount.test.ts` is the unit test. `src/modules/delivery/tests/unit/fulfillment.test.ts` is also a graph neighbor.

## Notes
- Shipping is refunded only when `takesLastUnit` is true. Whichever cancel or return takes the last unit of the order refunds it, once, and it is never split across partial ones. This is the module's reading of Art. 13(2) that avoids refunding delivery twice.
- For returns, shipping depends on `reason`:
  - `defective` or `wrong_item`: the full `shippingPaid` is refunded, since the fault lies with the seller.
  - Any other reason, treated as a withdrawal: `min(shippingPaid, cheapestStandardShipping)`, so a dearer method's surcharge stays with the shop.
- A cancel ignores the cheapest-standard cap, because nothing was delivered for it.
- `shippingPaid` is expected to be already net of earlier refunds. `shippingStillOwed` is the helper that produces that figure.
- `shippingStillOwed` uses `Math.max` with an `as Money` cast, because `Math.max` returns a bare `number`.
- The module header points to related documentation at `src/modules/returns/model.ts`, under the anchor `#what-the-customer-gets-back`.
