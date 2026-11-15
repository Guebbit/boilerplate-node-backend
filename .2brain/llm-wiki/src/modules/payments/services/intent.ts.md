---
source: src/modules/payments/services/intent.ts
sha256: c5fdf56d33f16155760497964d011b9778c367fc651ae536a44625d00ecbd8d7
generated_at: 2026-11-14T21:07:09.076565+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/intent.ts

## Purpose

Entry point for the module's money-moving flow: creates (or idempotently refreshes) a payment intent for an order, cancels a still-open intent on a specific payment, and closes any dangling intent when its order is canceled. Every code path in this file guarantees that at most one provider-side intent is ever exposed to the client for a given order.

## Key elements

- **`createIntent(orderId, authContext)`** — Resolves the order (buyer-scoped), confirms it is payable via `isPayable`, obtains a provider, upserts the payment row, asks the provider to prepare/resume an intent, guards against stray or racing duplicates (returns 409 `PAYMENT_IN_FLIGHT`), and returns 201 (new row) or 200 (refresh). Attaches `clientSecret` — the only field never persisted.
- **`cancelOpenIntent(payment, reason)`** — Cancels a single payment's open provider intent. No-ops for payments with no `providerRef` or for hand-recorded (`manual`) payments. Throws `PaymentInFlightError` if the provider reports the intent already succeeded or is mid-flight.
- **`cancelOpenIntentForOrder(orderId, expired?)`** — Best-effort close of the order's open intent. On `PaymentInFlightError` reconciles via `settleFromProvider` (refund path). Marks the payment `canceled` only after provider confirmation and only from a settleable status. Sends a transfer-expired email when the hold ran out. Never rethrows provider failures after the order is already canceled. Marked `@internal`; only the module's event subscription may invoke it.
- **`rejectStrayIntent(provider, strayRef, orderId)`** *(internal)* — Cancels a duplicate intent the provider opened, logs the conflict, and returns a 409 `PAYMENT_IN_FLIGHT` envelope.

## Relationships

- **`src/modules/orders/index.ts`** — Re-exports consumed here: `orderService` (for `getById` with buyer scoping), `buyerIdOf`, `orderTotal` (frozen amount), and `isPayable` (lifecycle guard). This file never re-implements order-side rules.
- **`src/modules/orders/domain/lifecycle.ts`**, **`src/modules/orders/domain/rules.ts`**, **`src/modules/orders/domain/totals.ts`** — Underlying domain definitions that `@modules/orders` re-exports; `isPayable` gates whether an order can accept an intent, `orderTotal` freezes the amount, and `buyerIdOf` extracts the payer.
- **`src/modules/orders/services/index.ts`** — Houses `orderService` used for the buyer-scoped `getById` call.
- **`src/modules/payments/providers/index.ts`**, **`src/modules/payments/providers/errors.ts`** — `resolvePaymentProvider`, `providerNamed`, the `PaymentProvider` interface, and `PaymentInFlightError`. All provider I/O funnels through these.
- **`src/modules/payments/domain/index.ts`**, **`src/modules/payments/domain/lifecycle.ts`** — `isHandRecorded` (skip provider cancel for manual payments) and `SETTLEABLE_PAYMENT_STATUSES` (status guard before writing `canceled`).
- **`src/modules/payments/model.ts`** — `PaymentDocument` type used by `cancelOpenIntent` and the repository calls.
- **`src/modules/payments/module.ts`** — Subscribes the order-canceled event to `cancelOpenIntentForOrder`; the sole caller of that function.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` envelope builders and `ResponseSuccess` / `ResponseReject` types.
- **`src/infrastructure/adapters/logger.ts`** — Error logging for stray-intent refusal and best-effort cancel failures.
- **`src/infrastructure/i18n/index.ts`**, **`src/infrastructure/i18n/context.ts`** — `t()` for user-facing error messages.

## Notes

- **Stryker mutation-test annotations** (`// Stryker disable all` / `// Stryker restore all`) wrap every logging-only `.catch` block; these blocks are intentionally non-testable (fire-and-forget error logs).
- **Mongoose spread pitfall:** The upsert explicitly lists `amount`, `currency`, `provider` rather than spreading the hydrated order document, because Mongoose schema paths live on the prototype and are not own enumerable properties.
- **`cancelOpenIntentForOrder` is `@internal`** — deliberately not exposed on `paymentService`; only the module's event subscription may invoke it.
- **201 vs 200:** The first successful call that inserts a payment row returns 201; a re-call (double-click) refreshes the same row and returns 200.
- **`clientSecret` is the only non-persisted field** in the response; it is never read back from the database.
