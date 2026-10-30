---
source: src/modules/payments/services/intent.ts
sha256: 7a5758e42bffea9ae1d0f7a1c48bf6c50b3048aaf3533d908a99c31ab67fe864
generated_at: 2026-10-29T05:11:16.680817+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/intent.ts

## Purpose

Entry point into the payments module's money-moving flow: creates (or refreshes) a provider payment intent for an order, and closes open intents when an order is cancelled. Guarantees the amount is frozen via the order's own `orderTotal`, enforces single-intent-per-payment, and coordinates with the orders module for status validation.

## Key elements

- **`createIntent(orderId, authContext)`** — Main export. Validates the order is payable (`isPayable`), resolves a configured provider, upserts a payment row via `paymentRepository`, asks the provider to prepare (or resume) an intent, and returns the payment with its `clientSecret`. Returns 201 on first creation, 200 on refresh, or a 409/404/422 reject. Handles two race conditions where a stray second intent is opened (adapter resume failure, concurrent first-time asks) by cancelling the stray and rejecting.
- **`cancelOpenIntent(payment, reason)`** — Closes a specific payment's provider intent. Resolves immediately if no provider ref exists or the payment was hand-recorded. Throws `PaymentInFlightError` if the provider reports the intent already succeeded or is mid-flight.
- **`cancelOpenIntentForOrder(orderId, expired?)`** — `@internal` listener registered in `../module.ts` for `order.cancelled`. Best-effort: finds the payment, calls `cancelOpenIntent`, conditionally moves status to `cancelled`, sends a transfer-expired email if applicable, and reconciles on-the-spot if the provider says the intent already succeeded. All failures are logged, never rethrown.
- **`rejectStrayIntent(provider, strayRef, orderId)`** (private helper) — Cancels a stray intent the provider opened for a payment that already holds one, logs the conflict, and returns a 409 `PAYMENT_IN_FLIGHT` reject.

## Relationships

- **`@modules/orders`** (index, services, domain/lifecycle, domain/rules, domain/totals) — imports `orderService.getById`, `isPayable`, `orderTotal`, `buyerIdOf` to validate order state and freeze the chargeable amount.
- **`../providers`** (index, errors) — calls `resolvePaymentProvider()`, `providerNamed(...)`, and `provider.prepare` / `provider.cancel`; catches `PaymentInFlightError` to decide between reconciliation and logging.
- **`../domain`** (index, lifecycle) — uses `isHandRecorded` and `SETTLEABLE_PAYMENT_STATUSES` to gate cancellation and status transitions.
- **`../model`** — types the `PaymentDocument` handled by cancellation functions.
- **`../module.ts`** — registers `cancelOpenIntentForOrder` as the `order.cancelled` listener.
- **`@infrastructure/http/response`** — builds all `ResponseSuccess` / `ResponseReject` envelopes.
- **`@infrastructure/i18n`** — localizes the conflict message via `t('payments.intent-conflict')`.
- **`@infrastructure/adapters/logger`** — structured error logging for stray-intent failures and best-effort cancel failures.

## Notes

- `clientSecret` appears only in the `createIntent` response; it is never persisted and never read back by any other endpoint.
- `cancelOpenIntentForOrder` is deliberately **not** on `paymentService` — it is `@internal`, callable only by the module's `subscribe` in `module.ts`.
- The 201-vs-200 distinction is load-bearing: 201 signals a new payment row was inserted; 200 signals a refresh of an existing one. Clients can use this to distinguish first-paint from double-click.
- `cancelOpenIntent` (used in request paths) propagates `PaymentInFlightError`; `cancelOpenIntentForOrder` (used in the cancel listener) swallows it and triggers `settleFromProvider` instead, since there is no request to reject.
- Stryker `disable`/`restore` comments wrap log-only error handlers so mutation testing does not flag them.
