---
source: src/modules/payments/services/offline.ts
sha256: 2b0f4403c574ebfe5de25f3621b600297905f1851070273859634a8809657781
generated_at: 2026-10-15T11:31:00.264471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/offline.ts

## Purpose

Records a payment that arrived outside any card provider (cash at the counter, phone order paid by bank transfer) and routes it through the identical `settlePayment` path used by card payments, so the order transitions `pending → paid`, stock commits, and the same domain events fire. It exists so that non-card money enters the system with exactly the same lifecycle guarantees as provider-confirmed card charges.

## Key elements

- **`OfflinePaymentInput`** — interface for the parsed admin request body: a non-card `PaymentMethod`, an optional `reference` string, and an optional `receivedAt` ISO date.
- **`recordOfflinePayment(orderId, input, context)`** — the sole exported function. Validates the input, loads the order, enforces the own-money and payability rules, cancels any open provider intent on that order, upserts the payment row via the repository, hands the result to `settlePayment`, emits audit and analytics records, and returns a `ResponseSuccess` (201 on create, 200 on convert-over-existing-intent) or a `ResponseReject`.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `generateSuccess`, `generateReject`, `fieldError`, and the `ResponseSuccess` / `ResponseReject` type shapes used for every return path.
- **`src/infrastructure/i18n/index.ts`** — supplies the `t()` translation helper for all user-facing error and success messages.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is called once after a successful settlement to write the `PAYMENT_RECORDED_OFFLINE` audit entry.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` produce the `PAYMENT_RECORDED_OFFLINE` analytics event.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** — re-export `orderService`, `orderTotal`, and `isPayable`, all consumed here for lookup, amount calculation, and payability gating.
- **`src/modules/orders/domain/lifecycle.ts`** — owner of `isPayable`; the payability rule lives here, not in this file.
- **`src/modules/orders/domain/totals.ts`** — owner of `orderTotal`, used to compute the `amount` stored on the new payment row.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` and `paymentRepository.upsertOffline` are the only data-access calls in this file.
- **`src/modules/payments/audit.ts`** — provides the `paymentsAuditActions.PAYMENT_RECORDED_OFFLINE` action constant.
- **`src/modules/payments/analytics.ts`** — provides the `paymentsAnalyticsEvents.PAYMENT_RECORDED_OFFLINE` event constant.
- **`src/modules/payments/model.ts`** — supplies the `PaymentDocument` type used as the success payload.
- **`src/modules/payments/providers/index.ts`** / **`src/modules/payments/providers/errors.ts`** — source of `PaymentInFlightError`, caught to turn an in-flight intent cancellation failure into a 409 response.

## Notes

- **Unscoped order lookup.** `orderService.getById` is called without a caller-scope filter by design: authorization (`payments.any.create`) is already enforced at the route, and the own-money check (`orderService.ownMoneyRefusalFor`) is the next gate. This is an operator-only path, not a customer self-service one.
- **Mongoose spread pitfall.** The code builds the upsert payload with explicit fields rather than `{ ...order, currency }` because the order is a hydrated Mongoose document whose schema paths are prototype getters, not own enumerable properties—spreading it yields an empty object.
- **`cancelOpenIntent` before upsert.** If a card intent is still open at the provider, it is cancelled *before* the row is overwritten. Skipping this would leave an orphan intent that can still resolve days later with no local row to reconcile the charge against.
- **201 vs 200.** The status code is `created ? 201 : 200`. A 200 means the offline payment converted over an existing (unpaid, intent-based) row rather than creating a new one.
- **Flat `await` style.** Each step depends on the previous resolved value; nested `.then()` chains are deliberately avoided (same convention as `@modules/orders`'s `crud.ts#create`).
