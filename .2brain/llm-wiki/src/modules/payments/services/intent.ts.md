---
source: src/modules/payments/services/intent.ts
sha256: a0b7ce986a180a86fe33589bba8081c4538d8de0360ba8c39b70a9a919ecba67
generated_at: 2026-11-08T07:26:54.197629+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/intent.ts

## Purpose

Entry point into the payments module's money-moving flow: creates (or refreshes) a payment intent at the provider for a given order, and provides the cancel counterpart. Every call that opens, resumes, or closes a provider-side intent flows through this file.

## Key elements

- **`createIntent(orderId, authContext)`** — Main exported function. Resolves the order (buyer-scoped), checks payability, resolves a provider, upserts a payment row, asks the provider to prepare/resume an intent, backstops stray-intent races, attaches the reference, and returns the payment with its one-time `clientSecret`. Responds 201 on first creation, 200 on refresh, 409 on conflict.
- **`cancelOpenIntent(payment, reason)`** — Asks the provider to close a specific payment's open intent. Resolves immediately if the payment has no `providerRef` or was recorded manually. Throws `PaymentInFlightError` if the provider reports the intent already succeeded or is mid-flight.
- **`cancelOpenIntentForOrder(orderId, expired?)`** — Best-effort handler wired to the `order.canceled` event (see `../module.ts`). Finds the payment, closes the intent, marks it `canceled`, optionally mails a transfer-expiry notice, and reconciles via `settleFromProvider` if the provider reports the intent already succeeded. Swallows all errors after logging.
- **`rejectStrayIntent(provider, strayRef, orderId)`** *(private)* — Cancels a stray intent the provider opened despite an existing one, logs it, and returns a 409 `PAYMENT_IN_FLIGHT` envelope. Never rejects.

## Relationships

- **`@infrastructure/i18n`** — `t()` provides user-facing error strings (e.g. `'payments.intent-conflict'`).
- **`@infrastructure/adapters/logger`** — `logger.error` records stray-intent refusals and best-effort cancel failures.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build the HTTP envelopes returned to the caller.
- **`@modules/orders`** (barrel: `index.ts`, `services/index.ts`, `domain/lifecycle.ts`, `domain/totals.ts`) — Supplies `orderService.getById`, `buyerIdOf`, `orderTotal` (frozen amount), and `isPayable` (lifecycle rule). This file never re-implements the payability rule.
- **`../providers`** (`index.ts`, `errors.ts`) — `resolvePaymentProvider` picks the active provider; `providerNamed` resolves by stored name; `PaymentInFlightError` is the thrown/rejected signal for "money already moved."
- **`../model`** — `PaymentDocument` type used by `cancelOpenIntent` and the repository calls.
- **`../domain`** (`index.ts`, `lifecycle.ts`) — `isHandRecorded` (manual/bank-transfer detection) and `SETTLEABLE_PAYMENT_STATUSES` guard which payments are still closeable.
- **`../module.ts`** — Wires `cancelOpenIntentForOrder` as the `order.canceled` subscriber; this file does not self-register.

## Notes

- **`clientSecret` is returned exactly once** (in the `createIntent` response) and is never persisted. No other response in this module carries it.
- **Mongoose spread gotcha:** the upsert call uses explicit field extraction (`amount: orderTotal(order)`, `currency`) rather than `{ ...order }` because Mongoose document schema paths live on the prototype and are invisible to object spread.
- **201 vs 200:** the `created` flag from `paymentRepository.upsertIntent` determines the status code; a repeated call refreshes the same row and gets 200.
- **`cancelOpenIntentForOrder` is best-effort** (logs, never rethrows) because the order is already canceled when it runs. `cancelOpenIntent`, by contrast, *does* throw `PaymentInFlightError` so its caller can react.
- **Stray-intent backstop:** two race windows are covered — (a) provider returns a different ref than what's stored, (b) two concurrent first-time asks both prepare and the conditional attach keeps only the first writer's ref. In both cases the losing ref is canceled via `rejectStrayIntent`.
- **Stryker annotations** (`// Stryker disable all` / `restore all`) guard logging-only branches from mutation testing, since killing a log line has no observable behavioral effect.
