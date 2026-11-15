---
source: src/modules/payments/tests/unit/refund-rules.test.ts
sha256: caadde0790ae825baa62a48c82089ff4e5d906576fe8ef362d554ffa712ec879
generated_at: 2026-11-14T21:22:06.485904+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/refund-rules.test.ts

## Purpose

Unit tests for the pure refund-rule functions in the payments domain: which refunds are still open, which may be voided or settled by hand, whether a new refund exceeds the remaining amount, the legal deadline, and how open disputes (chargebacks, inquiries) gate those decisions. Exists to lock down the business logic without touching the provider or database.

## Key elements

- **`paymentOn(provider)`** — factory returning a 100.00 EUR payment with no refunds; used to vary only the provider field.
- **`refundIn(facts)`** — factory returning a 30.00 EUR refund record with a given status, optional failure reason, `reversedAt`, and `providerRefundRef`.
- **`chargeback(status, amount?)` / `inquiry(status)`** — factories producing dispute records of the respective `DisputeKind` for the dispute-rule tests.
- **`describe('isOpenRefund')`** — parameterised table confirming which `RefundStatus` × `RefundFailureReason` combinations count as open (pending, failed-unknown, failed-declined are open; succeeded and failed-canceled are not).
- **`describe('mayBeCanceled')`** — asserts that manual-provider refunds are cancellable while pending, card refunds only after a definitive decline (`declined`, `insufficient_funds`), and that `unknown`/`provider_unavailable` do not unlock cancellation.
- **`describe('a refund the provider took back')`** — covers bounced refunds (`reversedAt` set): they can be settled by hand, are not voidable, and are never settled by hand when the failure reason is `disputed`.
- **`describe('exceedsRemaining')`** — verifies that a pending refund is blocked when a previously settled refund already consumed part of the 100.00, but not when the prior refund was bounced or already carries a `providerRefundRef`.
- **`describe('refundDueBy')`** — confirms the function simply reads `dueBy` from the record and returns `undefined` when absent.
- **`describe('the dispute rules')`** — exercises `hasOpenChargeback`, `hasOpenDispute`, `lostToChargebacks` (cent conversion, only `lost`/`accepted` chargebacks count), and the interplay: a refund refused as `disputed` is neither cancellable nor hand-settleable while a chargeback is open, becomes hand-settleable once a lost chargeback fully covers it, and becomes voidable (but not hand-settleable) after the shop wins.

## Relationships

- **`src/modules/payments/domain/index.ts`** — barrel import; provides all eight functions under test (`isOpenRefund`, `mayBeCanceled`, `mayBeSettledByHand`, `exceedsRemaining`, `refundDueBy`, `hasOpenChargeback`, `hasOpenDispute`, `lostToChargebacks`).
- **`src/modules/payments/domain/disputes.ts`** — source of the dispute predicates (`hasOpenChargeback`, `hasOpenDispute`, `lostToChargebacks`) that the "dispute rules" suite exercises.
- **`src/modules/payments/domain/lifecycle.ts`** — source of the refund-lifecycle predicates (`isOpenRefund`, `mayBeCanceled`, `mayBeSettledByHand`, `exceedsRemaining`, `refundDueBy`).
- **`src/types/index.ts`** — imported as `@types`; supplies the enums (`RefundStatus`, `RefundFailureReason`, `DisputeKind`, `DisputeStatus`) used to build test fixtures and as discriminators in assertions.

## Notes

- All amounts are strings (`'100.00'`, `'30.00'`) in fixtures, but `lostToChargebacks` returns integer cents (e.g. `4000` for `'40.00'`). Tests assert the cent value directly.
- `mayBeSettledByHand` for a `disputed`-refused refund depends on the chargeback amount covering the refund amount exactly (29.99 < 30.00 → false). This boundary is intentionally tested.
- The test file imports from the barrel (`@modules/payments/domain`) rather than reaching into individual domain files; if a function is removed from the barrel it breaks here even if the source file still exports it.
