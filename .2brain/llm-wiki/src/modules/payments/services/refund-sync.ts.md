---
source: src/modules/payments/services/refund-sync.ts
generated_at: 2026-11-22T06:52:34.631261+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/refund-sync.ts

## Purpose
Handles refunds from the payment provider's side. A refund the provider accepted but has not settled is re-read until it ends, and a provider's report on a refund (from a re-read, or from the webhook's listing in `external-refunds`) is turned into the record's next state. The provider's word is the only authority; a delivery's body decides nothing.

## Key elements
- **`applyRefundState(payment, refund, state, refundRef)`**: maps a `ProviderRefundState` onto a refund record. It returns the updated payment, or `null` when nothing changed.
  - `succeeded` on an open refund calls `settleRefund` with `providerRefundRef` and `from: OPEN_REFUND_STATUSES`.
  - `failed` on a refund that is open or already settled calls `reverseRefund`. The reason is `state.failureReason`, defaulting to `RefundFailureReason.declined`.
  - Any other combination returns `null`.
- **`isOpenOrSettled(refund)`** (private): true if the refund is not already reversed and is either `succeeded` or open. It decides whether a failure report can still change the record.
- **`rereadRefund(payment, refund)`**: re-reads one `pending` refund at the provider.
  - It resolves the provider from `payment.provider` through `paymentProviderRegistry`.
  - It calls `provider.retrieveRefund(refundRef)` and passes the result to `applyRefundState`.
  - It returns `null` without calling the provider if the refund has no `providerRefundRef`, the provider can't be resolved, or the status isn't `pending`.
  - Any error is logged with `logger.warn` and turned into `null`.

## Relationships
- `src/modules/payments/services/refund-settlement.ts` is not a listed graph neighbor, but the module header says all writes go through its conditional `settleRefund` and `reverseRefund`, so redeliveries and races change nothing.
- `src/modules/payments/providers/registry.ts`: `paymentProviderRegistry.resolve` supplies the provider client.
- `src/modules/payments/providers/index.ts`: supplies the `ProviderRefundState` type.
- `src/modules/payments/domain/index.ts`: supplies `OPEN_REFUND_STATUSES`, `isOpenRefund` and `isReversed`.
- `src/types/index.ts` (imported as `@types`): supplies the `RefundStatus` and `RefundFailureReason` enums.
- `src/infrastructure/adapters/logger.ts`: used to warn when a re-read fails.
- The module header says the webhook's listing in `external-refunds` feeds provider reports into this module, and that a sweep re-reads every record holding a provider refund id. Neither the call into `applyRefundState` nor the sweep is in this file, and `refunds.ts` is not referenced here.

## Notes
- The sweep only re-reads and never resends a refund.
- A `failed` report never produces `canceled`. That status is staff's void and is closed for good.
- A refund that is already settled is not settled again.
- A re-read failure is logged and left for the next sweep, so one bad record does not hold up the others.
- The `// Stryker disable/restore` comments around the log call exclude it from mutation testing.
