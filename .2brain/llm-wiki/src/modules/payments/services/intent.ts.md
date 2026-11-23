---
source: src/modules/payments/services/intent.ts
source_sha256: 7b33b77a7faaf69599113d105931c2f633cf76d43f3ac2e6b84c9f94b7ed3a0f
context_sha256: 7a155e179e4ff847296062594ff05e0a89380367e21ba9bcd264d8542efac185
generated_at: 2026-11-22T06:51:00.739796+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/intent.ts

## Purpose
Handles the payment intent lifecycle for an order: creating or refreshing the intent at the payment provider (the entry point into the module's money-moving flow), and closing an open intent when it is no longer needed.

## Key elements
- `createIntent(orderId, authContext?)` — loads the buyer's order, checks it is payable, resolves the configured provider, upserts the payment row (amount from `orderTotal`, the order's frozen currency), asks the provider to `prepare` (resuming any stored `providerRef`), attaches the provider reference, and returns the payment with `clientSecret`. Responds 201 for a newly inserted payment row and 200 on a refresh. Rejects with 409 when the order is not payable, when no provider is configured (`PAYMENT_CARD_NOT_AVAILABLE`), or when a stray intent is detected (`PAYMENT_IN_FLIGHT`).
- `cancelOpenIntent(payment, reason)` — asks the provider to close the payment's intent. Resolves immediately if there is no `providerRef` or the payment was recorded by hand. Throws `PaymentInFlightError` if the provider says the intent already succeeded or is mid-flight.
- `cancelOpenIntentForOrder(orderId, expired = false)` — best-effort handler for order cancellation, marked `@internal`. For a payment in a settleable status it cancels the provider intent, then sets the status to `canceled` only if it is still in a settleable status. If the cancel was caused by the hold expiring and the row has a `transferReference`, it sends `mailTransferExpired`. On `PaymentInFlightError` it reconciles through `settleFromProvider`. Any other failure is logged and not rethrown.
- `rejectStrayIntent` (private) — cancels an unexpected second intent at the provider, logs it, and returns a 409 `PAYMENT_IN_FLIGHT`. It never rejects.

## Relationships
- **Orders** (`@modules/orders`): uses `buyerIdOf`, `orderTotal` and `isPayable`, so the amount and payability rules come from the order's owner. `buyerOrderScope` (from `./scope`) limits the order lookup to the buyer.
- **Providers** (`../providers`): `resolvePaymentProvider`, `providerNamed`, the `PaymentProvider` type and `PaymentInFlightError`.
- **Persistence**: `paymentRepository` (`upsertIntent`, `attachProviderRef`, `findByOrderId`, `updateStatusIfIn`) and the `PaymentDocument` type from `../model`.
- **Domain**: `isHandRecorded` and `SETTLEABLE_PAYMENT_STATUSES` from `../domain`.
- **Sibling services**: `withActions` (`./view`), `notPayable` and `orderNotFound` (`./errors`), `mailTransferExpired` (`./notify`), `settleFromProvider` (`./settlement`).
- **Infrastructure**: `generateSuccess`/`generateReject` for response envelopes, `t` for i18n messages, `logger` for error logging.

## Notes
- The amount comes from `orderTotal` (which includes shipping), not from the order lines alone. The currency is the order's frozen one.
- Two backstops refuse a second intent: a different reference returned for a payment that already holds one, and a lost race between two first-time requests, detected when the conditional attach keeps the other writer's reference. In both cases the stray is canceled.
- Fields are passed explicitly to `upsertIntent` because `order` is a hydrated Mongoose document, and spreading it would copy nothing.
- `cancelOpenIntentForOrder` is deliberately not exposed on `paymentService`.
- `clientSecret` is never stored. It appears only in the `createIntent` response.
- `// Stryker disable/restore` comments exclude the logging blocks from mutation testing.
