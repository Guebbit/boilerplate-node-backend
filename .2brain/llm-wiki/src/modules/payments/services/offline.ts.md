---
source: src/modules/payments/services/offline.ts
sha256: a35682f905b8f248f03baa0b8af51926e87e4dd88474ddb8c80c0ac1f34386ce
generated_at: 2026-09-27T15:26:40.224618+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/offline.ts

## Purpose
Records a payment that arrived outside the card provider (cash, bank transfer, phone-order payment) and routes it through the same `settlePayment` pipeline as a card payment, so the order transitions `pending → paid`, stock commits, and the usual domain events fire. It exists so that non-card money follows the identical settlement and side-effect path rather than a bespoke one.

## Key elements
- **`OfflinePaymentInput`** — Parsed request-body contract: `method` (any `PaymentMethod` except `'card'`), optional `reference`, optional `receivedAt` (ISO string).
- **`recordOfflinePayment(orderId, input, context)`** — The sole exported function. Sequentially:
  1. Rejects a future `receivedAt` with 422.
  2. Loads the order (unscoped, admin-only) and checks payability via `isPayable`.
  3. If a prior payment row exists, cancels its open provider intent before overwriting (prevents a dangling intent from charging later).
  4. Upserts the offline payment row via `paymentRepository.upsertOffline`.
  5. Calls `settlePayment(payment, { status: 'succeeded' })` — the shared settlement entry point.
  6. Emits an audit record (`PAYMENT_RECORDED_OFFLINE`) and an analytics event.
  7. Returns `201` with the settled `PaymentDocument`, or a structured rejection.

## Relationships
- **`@modules/orders`** (`index.ts`, `domain/lifecycle.ts`, `domain/totals.ts`, `services/index.ts`, `config.ts`) — Supplies `orderService.getById`, `isPayable` (lifecycle guard), `orderTotal`, and `shopCurrency`. The payability rule is owned here; this file delegates rather than re-implementing it.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value; `ResponseSuccess` / `ResponseReject` are the return-type union.
- **`@infrastructure/i18n/index.ts`** — `t()` localises all user-facing error/success strings.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` writes the `PAYMENT_RECORDED_OFFLINE` audit row.
- **`@infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` fire the `PAYMENT_RECORDED_OFFLINE` analytics event.
- **`src/modules/payments/audit.ts`** — `paymentsAuditActions` enum (action name for the audit record).
- **`src/modules/payments/analytics.ts`** — `paymentsAnalyticsEvents` enum (event name for the analytics payload).
- **`src/modules/payments/model.ts`** — `PaymentDocument` type returned on success.
- **`src/modules/payments/providers/index.ts` / `providers/errors.ts`** — `PaymentInFlightError` is caught when cancelling an open intent to distinguish "provider still processing" (→ 409) from unexpected errors (rethrow).

## Notes
- **Unscoped order lookup.** The `orderService.getById` call is deliberately unscoped; authorization was already enforced upstream by the `payments.any.create` route guard. There is no per-user ownership check here.
- **Intent cancellation is best-effort, not best-first.** If `cancelOpenIntent` throws a `PaymentInFlightError`, the function rejects with 409 and does *not* write the offline row — the provider still owns the in-flight charge. Any other error propagates (5xx).
- **Race window on settlement.** Between the `isPayable` check and `settlePayment`, the order can be refunded or otherwise settle. `settlePayment` reports this as `settlement.orderLost`; the function surfaces `settlementResponse(settlement)` rather than a 404.
- **Flat `await` style.** Steps are sequential top-level `await`s, not chained `.then()` calls — each step depends on the previous step's resolved value, matching the convention in `@modules/orders` `crud.ts`.
- **`context` doubles as audit identity.** `CallerContext` already carries the admin's identity; a separate `authContext` parameter would be redundant.
