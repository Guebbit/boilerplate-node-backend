---
source: src/modules/payments/services/intent.ts
sha256: 9d2b0329ab22e05ed1a141176410ad3baf514fb12cc9d7f76d2695a2eba6b616
generated_at: 2026-10-15T11:30:04.054478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/intent.ts

## Purpose

Entry point for the payments module's money-moving flow: creates (or refreshes) a provider payment intent for an order and handles cancellation of still-open intents when an order is cancelled. Guarantees the amount is frozen through the same `orderTotal` the order serializer uses, and ensures at most one live intent exists per payment.

## Key elements

- **`createIntent(orderId, authContext?)`** — Main export. Loads the order (buyer-scoped), checks payability via `isPayable`, resolves the provider, upserts a payment row with a frozen amount/currency, calls `provider.prepare`, attaches the returned `providerRef`, and returns the payment wire object with `clientSecret`. Returns **201** on first creation, **200** on refresh, **404/409** on not-found/not-payable/in-flight conflicts.
- **`cancelOpenIntent(payment, reason)`** — Closes a single payment's provider intent. No-ops if there is no `providerRef` or the provider is `manual`. Throws `PaymentInFlightError` if the provider reports the intent already succeeded.
- **`cancelOpenIntentForOrder(orderId)`** — Handler for the `order.cancelled` event (wired in `../module.ts`). Best-effort: looks up the payment, calls `cancelOpenIntent`, then conditionally writes status `cancelled`. If the provider reports the intent already succeeded (`PaymentInFlightError`), it calls `settleFromProvider` to refund on the spot. All other failures are logged and swallowed so the already-committed order cancellation is never blocked.
- **`rejectStrayIntent(provider, strayRef, orderId)`** *(internal)* — Cancels an intent the provider opened despite one already being stored, logs the conflict, and returns a **409 `PAYMENT_IN_FLIGHT`** envelope. Never rejects; a failed cancel is only logged.

## Relationships

- **`@infrastructure/i18n`** (`t`) — Localises user-facing error messages (`payments.intent-conflict`, `payments.order-not-found`).
- **`@infrastructure/adapters/logger`** — Logs stray-intent refusals, failed cancels, and the best-effort cancel failure in `cancelOpenIntentForOrder`.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build the HTTP envelopes returned to the caller.
- **`@modules/orders`** (`orderService`, `orderTotal`, `isPayable`) — Loads the order, freezes the amount, and gates payability via the order-lifecycle rule.
- **`../domain`** (`SETTLEABLE_PAYMENT_STATUSES`) — Defines which statuses are still open enough to cancel or settle.
- **`../model`** (`PaymentDocument`) — Type for the persisted payment row.
- **`../presenter`** (`presentPayment`) — Shapes the stored payment into its wire representation before adding `clientSecret`.
- **`../module.ts`** — Registers `cancelOpenIntentForOrder` as the `order.cancelled` event listener.
- **`./settlement`** (`settleFromProvider`) — Called from `cancelOpenIntentForOrder` when the provider reports the intent already succeeded, triggering an immediate refund.
- **`./scope`** (`buyerOrderScope`) — Constrains the order lookup to the authenticated buyer.

## Notes

- **Mongoose spread gotcha:** `paymentRepository.upsertIntent` receives explicit fields (`amount`, `currency`, `provider`), not `{ ...order, currency }`, because a hydrated Mongoose document stores schema paths as prototype getters, not own enumerable properties — a spread would yield `{}`.
- **`clientSecret` is the only non-persisted field** on the payment wire response; it is generated per `provider.prepare` call and never stored or read back.
- **Two backstop checks for stray intents:** (1) the stored `providerRef` differs from the provider's return, and (2) a concurrent first-time `attachProviderRef` kept the other writer's reference. Both call `rejectStrayIntent`.
- **201 vs 200:** The `created` flag from `paymentRepository.upsertIntent` determines the status code; a re-ask (double-click) always returns 200 with the same intent.
- **`cancelOpenIntentForOrder` is best-effort by design:** the order is already cancelled when it runs, so it must never throw back into the event pipeline. `cancelOpenIntent` (the standalone export) *does* throw `PaymentInFlightError` for callers that need to react.
- **Stryker mutations** around `logger` calls are disabled to prevent the mutation-testing tool from removing log-only statements that would otherwise leave the promise chain unresolved.
