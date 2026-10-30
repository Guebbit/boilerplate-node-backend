---
source: src/modules/payments/services/errors.ts
sha256: d5d39af578f59572fef58fb33c76ba6a7a01053b422598c70279991f8bb1e1f2
generated_at: 2026-10-29T05:10:30.020636+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/errors.ts

## Purpose

Centralized factory functions and one internal error class for every "this payment action cannot proceed" response in the payments service layer. It is deliberately a **leaf module** (no persistence or cross-service imports) so any file under `services/` can reach it without creating dependency edges among the services themselves.

## Key elements

- **`notPayable()`** → 409 `ResponseReject`. Returned when an order fails the `isPayable` check, is lost in a check-then-write race, or the provider rejects because the order no longer exists. Single code (`PAYMENT_ORDER_NOT_PAYABLE`) covers all three cases.
- **`cardNotAvailable()`** → 409 `ResponseReject`. Returned when the deployment has no card provider configured (`NODE_PAYMENT_PROVIDER` unset). Mirrors the same refusal that `GET /payments/methods` and checkout would produce.
- **`paymentNotFound()`** → 404 `ResponseReject`. Generic "payment does not exist or is not visible to caller" answer.
- **`orderNotFound()`** → 404 `ResponseReject`. Same shape, scoped to an order ID named in the request.
- **`RefundLeftOpenError`** — internal `Error` subclass (not an HTTP response). Carries `refundId` and the provider's `cause`. Thrown when a provider call for an already-recorded refund is refused; the record stays `failed` for retry by the refund sweep.

## Relationships

- **Imports** `generateReject` / `ResponseReject` from `src/infrastructure/http/response.ts` and `t` from `src/infrastructure/i18n/index.ts` (via `@infrastructure/i18n`).
- **Re-exported** through `src/modules/payments/services/index.ts`.
- **Consumed** by the sibling service files (`intent.ts`, `offline.ts`, `refunds.ts`, `settlement.ts`, `view.ts`), each of which calls the relevant factory or throws/catches `RefundLeftOpenError`.

## Notes

- The module imports `ERROR_CODES` from `@api/error-codes` (not shown in the graph neighbors list). `paymentNotFound` and `orderNotFound` bypass `ERROR_CODES` entirely, passing only a translated message to `generateReject`.
- `RefundLeftOpenError` is the **only non-HTTP** export: it is an application-level signal, not a client-facing response. Callers that can tolerate a delayed refund should catch it specifically; any other error from the refund path means the record may not exist.
- All 409 responses are indistinguishable to the client by design — a client cannot (and need not) tell whether the order failed pre-write, was lost to a race, or bounced at the provider.
