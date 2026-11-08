---
source: src/modules/payments/services/refund-sync.ts
sha256: f112e11516912d7268c73d99921d886cdd9553862f4aa7f73b2c3f0648df5063
generated_at: 2026-11-08T07:28:35.648690+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refund-sync.ts

## Purpose

Bridges the provider's side of a refund to the local record. When a refund is still `pending`, a sweep re-reads the provider for a final status; when a webhook lists a refund (`external-refunds.ts`), the provider's report is applied here. The provider's own status is the sole authority — the delivery body itself changes nothing.

## Key elements

- **`applyRefundState`** (exported) — Maps a `ProviderRefundState` onto a `RefundRecord`. `succeeded` on an open record → `settleRefund`; `failed` on an open-or-settled record → `reverseRefund`. Returns the mutated `PaymentDocument` or `null` if no transition applies.
- **`isOpenOrSettled`** (private) — Guard: the record is not yet reversed and is either `succeeded` or still open. Prevents re-applying a failure to an already-reversed record.
- **`rereadRefund`** (exported) — Polling entry point. Resolves the provider via the registry, calls `provider.retrieveRefund(refundRef)`, then hands the result to `applyRefundState`. Swallows errors (logs a warning, returns `null`) so a single unreachable provider never blocks the remaining sweep.

## Relationships

- **`./refund-settlement.ts`** — All actual state transitions (`settleRefund`, `reverseRefund`) are delegated here; this file only decides *whether* to call them.
- **`../providers/registry.ts`** — `paymentProviderRegistry.resolve(payment.provider)` yields the concrete provider adapter whose `retrieveRefund` is called.
- **`../domain` (barrel → `lifecycle.ts`)** — Supplies `OPEN_REFUND_STATUSES`, `isOpenRefund`, `isReversed` predicates and the conditional-transition constants.
- **`../model.ts`** — `PaymentDocument` and `RefundRecord` shape every parameter and return.
- **`../providers` (barrel)** — `ProviderRefundState` type passed from the provider adapter into `applyRefundState`.
- **`@infrastructure/adapters/logger`** — `logger.warn` on re-read failures.
- **`@types`** — `RefundStatus`, `RefundFailureReason` enums used for guards and the default failure reason.
- **`./external-refunds.ts`** — Webhook-driven counterpart; this module handles the polling path, that module handles the push path. Both funnel into `applyRefundState`.

## Notes

- Provider `canceled` is deliberately **not** handled here — that status is reserved for a staff-initiated void and is closed for good; only `succeeded`/`failed` drive transitions.
- The sweep never *resends* a refund; it only asks "what happened?" A `pending` record with no `providerRefundRef` or unknown provider short-circuits to `null`.
- All writes are conditional (enforced in `refund-settlement.ts`), so a redelivered webhook or a race between two sweeps is a no-op.
- Error handling in `rereadRefund` intentionally returns `null` rather than rethrowing, keeping the sweep loop going. The `// Stryker` annotations suppress mutation testing for the catch block.
