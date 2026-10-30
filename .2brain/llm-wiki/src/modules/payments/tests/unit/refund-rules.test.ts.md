---
source: src/modules/payments/tests/unit/refund-rules.test.ts
sha256: e26813daaa8508385e4152c5bbd0a7d888d2a383e0a4953259d7181926d5fc9f
generated_at: 2026-10-29T05:24:05.247233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/refund-rules.test.ts

## Purpose

Unit tests for the pure refund-rule predicates defined in the payments domain. The file exercises the state-machine logic that decides whether a refund is still open, may be voided or settled by hand, whether it exceeds the remaining refundable amount, its legal deadline, and how open disputes (chargebacks vs. inquiries) gate those actions.

## Key elements

- **`paymentOn(provider)`** – test factory that builds a 100 EUR payment with an empty `refunds` array.
- **`refundIn(facts)`** – test factory that builds a 30 EUR refund record with a given status and optional failure reason / `reversedAt` / `providerRefundRef`.
- **`chargeback(status, amount?)`** – test factory for a chargeback dispute record (default amount 100).
- **`inquiry(status)`** – test factory for a 100 EUR inquiry dispute record.
- **`describe('isOpenRefund')`** – table-driven test verifying which `(status, failureReason)` pairs count as "open" (pending, failed-unknown, failed-declined) vs. closed (succeeded, failed-canceled).
- **`describe('mayBeCanceled')`** – asserts that a pending manual refund can be voided, that a settled or already-canceled one cannot, and that a card refund is voidable only after a definitive refusal (`declined`, `insufficient_funds`) but not after `unknown`, `provider_unavailable`, or while still pending.
- **`describe('a refund the provider took back')`** – covers `mayBeSettledByHand` for a bounced refund (`reversedAt` set): it is settleable by hand for unclear reasons, is *not* voidable (it settled once), and is never settleable by hand when the failure reason is `disputed`.
- **`describe('exceedsRemaining')`** – verifies that a pending refund is held when the already-settled amount plus the new one exceeds the payment total, that a bounced refund is excluded from the sum, and that a refund already held by the provider (`providerRefundRef` set) is never held.
- **`describe('refundDueBy')`** – confirms the 14-day legal deadline from `createdAt` when a `returnId` is present, and `undefined` otherwise.
- **`describe('the dispute rules')`** – tests `hasOpenChargeback` (open chargebacks only, not inquiries), `hasOpenDispute` (any open dispute including inquiries), `lostToChargebacks` (sums only lost/accepted chargeback amounts in minor units, ignores inquiries), and the interaction of `mayBeSettledByHand` / `mayBeCanceled` with a `disputed`-refused refund under various chargeback states (open, lost-and-covering, lost-and-insufficient, won).

## Relationships

- **`src/modules/payments/domain/index.ts`** – barrel module from which all eight rule functions are imported (`@modules/payments/domain`).
- **`src/types/index.ts`** – source of the domain enums used throughout the tests: `RefundStatus`, `RefundFailureReason`, `DisputeStatus`, `DisputeKind` (imported as `@types`).
- **`src/modules/payments/domain/lifecycle.ts`** – expected home of the lifecycle predicates (`isOpenRefund`, `mayBeCanceled`, `mayBeSettledByHand`, `exceedsRemaining`, `refundDueBy`) re-exported through the domain barrel.
- **`src/modules/payments/domain/disputes.ts`** – expected home of the dispute predicates (`hasOpenChargeback`, `hasOpenDispute`, `lostToChargebacks`) re-exported through the domain barrel.

## Notes

- The test file imports everything through the **barrel** (`@modules/payments/domain`), not from individual domain modules. When moving a function, the barrel must keep re-exporting it or these tests break without an import-path change here.
- All monetary comparisons in `exceedsRemaining` and `lostToChargebacks` are expressed in **minor units** (e.g., 40 → 4000), while the factory helpers use major-unit amounts (30, 100, 80). The domain functions handle the conversion internally; the tests only assert the final minor-unit numbers.
- `mayBeSettledByHand` and `mayBeCanceled` are tested against both `paymentOn('manual')` and `paymentOn('stripe')` to confirm the provider string is the discriminator for the "definitive refusal" rule (card refunds require `declined`/`insufficient_funds`; manual refunds accept any pending state).
- The `refundDueBy` tests use fixed 2026 dates; they are timezone-sensitive and assume the function performs a simple 14-day `Date` addition without DST correction.
