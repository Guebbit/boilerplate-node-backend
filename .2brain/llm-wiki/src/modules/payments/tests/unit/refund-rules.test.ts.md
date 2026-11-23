---
source: src/modules/payments/tests/unit/refund-rules.test.ts
source_sha256: 988d6dac6fefe60c072878e3f0e13a88bc2c3c0188593ff144df034f647ddea7
context_sha256: 86038b4e9f6f2a0b25d9700cce8b13494961c44233593c0a4c9d268fe8def08e
generated_at: 2026-11-22T07:06:07.744210+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/refund-rules.test.ts

## Purpose
Unit tests for the pure refund rules in the payments domain: which refunds are still open, when a refund may be voided (canceled) or settled by hand, whether an unsent refund exceeds what the provider can still give back, the legal deadline of a refund, and how disputes (chargebacks and inquiries) affect all of this. The tests use plain object fixtures and need no I/O.

## Key elements
- **Fixtures**
  - `paymentOn(provider)`: a 100.00 EUR payment with no refunds.
  - `refundIn(facts)`: a 30.00 EUR refund in a given status. It can carry a failure reason, `reversedAt`, `reversedAfterSettling` and `providerRefundRef`.
  - `chargeback(status, amount = '100.00')` and `inquiry(status)`: EUR disputes of the given kind and status.
- **`isOpenRefund`**: a table test. Pending, and failed with `unknown` or `declined`, count as open. Succeeded, and failed with `canceled`, do not.
- **`mayBeCanceled`**
  - A `manual` payment: a pending refund may be canceled. A succeeded or already-canceled one may not.
  - A `stripe` payment: a refund may be canceled only after a failure of `declined` or `insufficient_funds`. `unknown`, `provider_unavailable`, `canceled` and pending do not qualify.
- **Provider-reversed refunds** (`reversedAt` set)
  - `mayBeSettledByHand` is true, even for an `unknown` reason.
  - `mayBeCanceled` is false when `reversedAfterSettling` is set, and true when it is absent.
  - A `disputed` failure reason follows the dispute rule.
- **`exceedsRemaining`**
  - An unsent refund that no longer fits what the provider already refunded is held.
  - A reversed refund is ignored when computing what remains.
  - A refund that already has a `providerRefundRef` is never held.
- **`refundDueBy`**: returns the `dueBy` date stamped on the record, or `undefined` when there is none.
- **Dispute rules**
  - `hasOpenChargeback` is true for `needs_response` or `under_review` chargebacks only. Inquiries, won chargebacks, and a missing `disputes` field give false.
  - `hasOpenDispute` also counts open inquiries.
  - `lostToChargebacks(payment, currency)` returns minor units (cents). It sums only `lost` or `accepted` chargebacks, so `'40.00'` gives `4000`. It ignores `won` and open chargebacks, inquiries, and chargebacks in a different currency.
  - **Refund refused as `disputed`**: it can be neither settled nor canceled while any dispute is open, whether a chargeback, an inquiry, or one of several. Once disputes are lost (any amount), won, closed, or absent, both actions are allowed.

## Relationships
- Imports `DisputeKind`, `DisputeStatus`, `RefundFailureReason` and `RefundStatus` from `@types` (`src/types/index.ts`).
- Imports all functions under test from the `@modules/payments/domain` barrel (`src/modules/payments/domain/index.ts`). The dispute helpers (`hasOpenChargeback`, `hasOpenDispute`, `lostToChargebacks`) presumably come from `disputes.ts`, and the refund-state rules from `lifecycle.ts`. The test only reaches them through the barrel.

## Notes
- The fixtures are structural objects, not model instances, so the rules take plain shapes. `disputes` is optional on a payment.
- The `provider` string drives the cancel rule: `'manual'` is treated as hand-paid and `'stripe'` as a card, with different cancel conditions.
- `chargeback` and `inquiry` are `const` arrow functions declared below the first `describe` blocks that use them. This works because they are only called inside test callbacks, which run after the module has loaded.
