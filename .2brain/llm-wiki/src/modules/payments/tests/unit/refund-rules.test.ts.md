---
source: src/modules/payments/tests/unit/refund-rules.test.ts
sha256: 807ed0ccb47cdbfa1b8f55af4564f1eec3bb8c850f62034ddeed3618f5890f86
generated_at: 2026-11-08T07:40:43.864538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/refund-rules.test.ts

## Purpose

Unit tests for the pure refund-rule functions that decide what a staff operator may do with an existing refund: whether it is still open, may be voided, may be settled by hand, whether it exceeds the remaining refundable amount, and the legal deadline tied to a return. Each test encodes the business contract of those decisions without touching a database or provider SDK.

## Key elements

- **`paymentOn(provider)`** – Fixture helper: a 100.00 EUR payment with zero refunds, parameterised by provider (`'manual'`, `'stripe'`).
- **`refundIn(facts)`** – Fixture helper: a 30.00 EUR refund with the given status, optional failure reason, `reversedAt`, and `providerRefundRef`.
- **`chargeback(status, amount?)`** – Fixture helper: a dispute record of kind `chargeback` with the given status and amount (default 100.00).
- **`inquiry(status)`** – Fixture helper: a dispute record of kind `inquiry`, 100.00.
- **`describe('isOpenRefund')`** – Verifies the open-vs-closed truth table across all `RefundStatus` × `RefundFailureReason` combinations.
- **`describe('mayBeCanceled')`** – Asserts that manual-provider refunds cancel freely while pending, but card refunds cancel only after a refusal that proves no money moved (`declined`, `insufficient_funds`), and never for `unknown`/`provider_unavailable`/`canceled`.
- **`describe('a refund the provider took back')`** – Covers the `reversedAt` state: settle-by-hand is allowed, void is not, and `disputed` failure reason blocks hand-settlement entirely.
- **`describe('exceedsRemaining')`** – Confirms the running-total guard: a pending refund is blocked once a settled refund leaves insufficient room; reversed refunds and refunds with a `providerRefundRef` are excluded from the total.
- **`describe('refundDueBy')`** – 14-day deadline after `createdAt` when a `returnId` exists; `undefined` otherwise.
- **`describe('the dispute rules')`** – Validates `hasOpenChargeback` (chargeback-only, open statuses), `hasOpenDispute` (any kind, open), `lostToChargebacks` (sums lost/accepted chargeback amounts in **minor units**, ignores won/inquiry), and the compound behavior of a `disputed`-refused refund across chargeback open / lost-covering / lost-partial / won states.

## Relationships

- **`src/types/index.ts`** – Source of the four enum-like types (`DisputeKind`, `DisputeStatus`, `RefundFailureReason`, `RefundStatus`) imported as `@types` and used throughout fixtures and assertions.
- **`src/modules/payments/domain/index.ts`** – Barrel the test imports as `@modules/payments/domain`; re-exports the eight pure functions under test.
- **`src/modules/payments/domain/lifecycle.ts`** – Expected origin of `isOpenRefund`, `mayBeCanceled`, `mayBeSettledByHand`, `exceedsRemaining`, and `refundDueBy` (the refund-lifecycle decision functions).
- **`src/modules/payments/domain/disputes.ts`** – Expected origin of `hasOpenChargeback`, `hasOpenDispute`, and `lostToChargebacks` (the dispute-adjacent refund guards).

## Notes

- `lostToChargebacks` returns amounts in **minor units** (e.g. `'40.00'` → `4000`), not the string-currency format used elsewhere in the fixtures.
- The "provider took back" scenario is signalled by a non-null `reversedAt` on a `failed` refund; it is semantically distinct from a plain failure and unlocks `mayBeSettledByHand` while locking `mayBeCanceled`.
- A `disputed` failure reason on a refund introduces a three-way gate: blocked while the chargeback is open, unblocked by hand only when a *lost* chargeback's amount ≥ the refund amount, and re-closable (voidable) once the shop *wins*.
- `exceedsRemaining` explicitly skips any refund that already carries a `providerRefundRef`, treating it as provider-held rather than shop-held.
- The file is marked `@module` (no named exports); all test logic lives in `describe`/`it` blocks with no shared mutable state.
