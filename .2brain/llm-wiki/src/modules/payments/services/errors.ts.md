---
source: src/modules/payments/services/errors.ts
source_sha256: afb781363b943a26faeaa71cdba806ba8cfe3fd241d4fdf57cec20d1ce4dbb1b
context_sha256: 31870caa7f2ebf26103bc55df1b71b8ff7f7968707455690e8fd7b03618ed96f
generated_at: 2026-11-22T06:50:07.060592+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/errors.ts

## Purpose
A leaf module holding the shared refusals for the payments services. It deliberately imports no persistence code, so every file in `services/` can use it without adding a dependency edge to anything else. Its central export is the single "this order can no longer be paid" rejection.

## Key elements
- `notPayable()`: returns a 409 `ResponseReject` with code `ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE` and the translated message `payments.order-not-payable`. It is used for three situations, and the client cannot tell them apart:
  - the order failed `@modules/orders`' `isPayable` check before any write;
  - the order changed between that check and the write (a race);
  - the money bounced straight back because the order was gone by the time it landed.
- `paymentNotFound()`: 404 reject (`payments.not-found`) for a payment that doesn't exist or that the caller may not see.
- `orderNotFound()`: 404 reject (`payments.order-not-found`) for an order named by a payment act that doesn't exist or that the caller may not see.
- `RefundLeftOpenError`: an `Error` subclass thrown when the provider refused or never answered a refund the application had already recorded. It carries `refundId`, takes its message from the `cause`, and keeps the original as `cause`. After this error the record is `failed`: it stays open, is held in `amountRefunded`, and is retried by the refund sweep with the same idempotency key.
- `WebhookProviderUnknownError`: an `Error` subclass thrown when a webhook names a provider with no installed adapter. It carries `providerName`. The controller answers 404.

## Relationships
- `src/infrastructure/http/response.ts`: supplies `generateReject` and the `ResponseReject` type, which the three reject factories use.
- `src/infrastructure/i18n/index.ts`: supplies `t`, which translates the message keys. `src/infrastructure/i18n/context.ts` is a graph neighbor, but this file does not import it.
- `src/modules/payments/controllers/post-payment-webhook.ts`: the controller that answers 404 for `WebhookProviderUnknownError`.
- Sibling services (`src/modules/payments/services/intent.ts`, `offline.ts`, `refunds.ts`, `external-refunds.ts`, `settlement.ts`, `view.ts`), re-exported through `src/modules/payments/services/index.ts`: the intended consumers of these factories and errors. `RefundLeftOpenError` is tied to the refund flow.
- `src/modules/payments/tests/integration/service.test.ts`: exercises these behaviors at the service level.

## Notes
- Because `notPayable()` is the same for all three causes, callers should not try to distinguish them in the response.
- Callers that only need the money to move eventually may log `RefundLeftOpenError` and carry on. Any other error means the refund record may not exist, or its state is unknown.
- The reject factories are functions, not constants, so `t()` is evaluated at call time (per request locale) and not at import time.
