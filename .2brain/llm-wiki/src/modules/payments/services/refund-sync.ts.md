---
source: src/modules/payments/services/refund-sync.ts
sha256: f112e11516912d7268c73d99921d886cdd9553862f4aa7f73b2c3f0648df5063
generated_at: 2026-10-29T05:12:48.865470+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refund-sync.ts

## Purpose

Bridges the provider-side lifecycle of a refund to the local record. It re-reads a refund from the provider until it reaches a terminal state, and converts the provider's reported status (success or failure) into the record's next state via conditional writes. The provider's own word is the sole authority; no delivery body or local assumption overrides it.

## Key elements

- **`applyRefundState(payment, refund, state, refundRef)`** — Maps a provider's `ProviderRefundState` onto a local `RefundRecord`. Settles an open refund on `succeeded`; reverses an open or already-settled refund on `failed`. Returns `null` when nothing changes (e.g. provider says `canceled`, record already settled, etc.).
- **`rereadRefund(payment, refund)`** — Entry point for the sweep. Resolves the provider via the registry, calls `provider.retrieveRefund(refundRef)`, then delegates to `applyRefundState`. On provider-unreachable errors, logs a warning and returns `null` so the record is retried on the next sweep.
- **`isOpenOrSettled(refund)`** *(private)* — Guards the failure path: true when the record is not already reversed and is either still open or already settled. Prevents double-reversal.

## Relationships

- **`./refund-settlement.ts`** — `applyRefundState` delegates all state transitions to `settleRefund` and `reverseRefund`, keeping writes conditional and idempotent.
- **`../providers/registry.ts`** — `rereadRefund` calls `paymentProviderRegistry.resolve(payment.provider)` to obtain the concrete adapter that knows how to `retrieveRefund`.
- **`../providers/index.ts`** — Supplies the `ProviderRefundState` type that `applyRefundState` consumes.
- **`../domain/index.ts`** — Provides `OPEN_REFUND_STATUSES`, `isOpenRefund`, and `isReversed` used for status guards.
- **`../model.ts`** — Source of the `PaymentDocument` and `RefundRecord` shapes passed through both exports.
- **`@types` (`src/types/index.ts`)** — `RefundStatus` and `RefundFailureReason` enumerations used in guards and the failure-reason fallback.
- **`./external-refunds.ts`** — The webhook-driven listing path that also feeds a `ProviderRefundState` into `applyRefundState` (referenced in the module doc comment).
- **`@infrastructure/adapters/logger.ts`** — Emits a `warn` when a re-read cannot reach the provider.

## Notes

- **`canceled` is intentionally ignored.** A provider reporting `canceled` is treated as a staff void (closed for good), not a failure; `applyRefundState` returns `null` and the record stays as-is.
- **Never resends.** The sweep only *reads* the refund at the provider. There is no retry-of-submission logic here.
- **All writes are conditional** (delegated to `refund-settlement.ts`), so concurrent redeliveries or races are no-ops rather than errors.
- **Stryker suppression** around the error handler in `rereadRefund` is deliberate: the `catch` branch is a single `logger.warn` + `return null` that mutation testing would flag as removable.
