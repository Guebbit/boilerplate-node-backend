---
source: src/modules/payments/services/errors.ts
sha256: d5d39af578f59572fef58fb33c76ba6a7a01053b422598c70279991f8bb1e1f2
generated_at: 2026-11-08T07:26:04.132136+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/errors.ts

## Purpose

Central collection of standardized HTTP error responses (409 / 404) and one domain error class for the payments service layer. It is a deliberate leaf module — no persistence or cross-module imports beyond infrastructure — so every file under `services/` can pull an error constant without introducing new dependency edges.

## Key elements

- **`notPayable(): ResponseReject`** — 409 response for the three indistinguishable "order can no longer be paid" cases (pre-write check failure, race-condition drift, money bounced after order vanished). Uses `ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE`.
- **`cardNotAvailable(): ResponseReject`** — 409 response when `NODE_PAYMENT_PROVIDER` is unset and a client still requests a card intent. Uses `ERROR_CODES.PAYMENT_CARD_NOT_AVAILABLE`.
- **`paymentNotFound(): ResponseReject`** — 404 for a payment that does not exist *or* the caller lacks visibility into.
- **`orderNotFound(): ResponseReject`** — 404 for an order named by a payment action that does not exist or is invisible to the caller.
- **`RefundLeftOpenError extends Error`** — Thrown when the provider refuses (or times out on) a refund the app has already recorded. Carries a `refundId` (the open record, now in `failed` state, eligible for sweep retry with the same idempotency key). Constructor accepts `cause` and sets `this.name`.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `generateReject` and the `ResponseReject` type used by every exported factory.
- **`src/infrastructure/i18n/index.ts` / `src/infrastructure/i18n/context.ts`** — provides the `t()` translation function for user-facing messages (`payments.order-not-payable`, `payments.card-not-available`, `payments.not-found`, `payments.order-not-found`).
- **`src/modules/payments/services/index.ts`** — barrel that re-exports this module alongside other service files.
- **`src/modules/payments/services/intent.ts`, `offline.ts`, `refunds.ts`, `settlement.ts`, `view.ts`** — consumer services that import specific error factories (e.g., `notPayable`, `cardNotAvailable`, `RefundLeftOpenError`) to build their reject responses or catch conditions.

## Notes

- **Leaf by design.** The module file doc explicitly states it avoids persistence imports so that any `services/` file can reach it without adding a new graph edge.
- **`notPayable` collapses three distinct causes** into one code + message. Clients cannot (and should not need to) distinguish them.
- **404s double as access-denied.** Both `paymentNotFound` and `orderNotFound` are used when the resource exists but the caller may not see it, to avoid leaking existence.
- **`RefundLeftOpenError` is the only class.** It is the one signal that the refund record *does* exist (state `failed`, held in `amountRefunded`) and will be retried by the refund sweep. Any other error means the record may not exist or its state is unknown.
- All message strings go through `t()` with `payments.*` i18n keys; no hardcoded user-facing text.
