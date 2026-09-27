---
source: src/modules/payments/services/intent.ts
sha256: 7da3785b2d844e5f81839b38007a927605ea033a3320a2425976874c0664777f
generated_at: 2026-09-27T15:26:22.206800+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/intent.ts

## Purpose

Entry point for the money-moving flow in the payments module. Creates (or refreshes) a payment intent for an order, resolves the payer identity, and handles cancellation of open intents at the provider. All four rules documented in `../index`'s module docblock apply here.

## Key elements

- **`resolvePayerId(orderUserId)`** — Resolves the payer against the `users` module. Returns `undefined` if the account was fully detached (erased); otherwise falls back to the order's stored id (with a warning) if the user no longer resolves. Never blocks payment on resolution failure.
- **`createIntent(orderId, authContext?)`** — Main export. Loads the order, verifies it is payable (`isPayable`), checks product availability fresh against `products`, upserts the payment row via `paymentRepository.upsertIntent`, calls the resolved provider's `prepare` to obtain a `providerRef` + `clientSecret`, attaches the ref, and returns a 201 response carrying the `clientSecret`. Idempotent for the double-click case; returns 409 if the order already settled.
- **`cancelOpenIntent(payment, reason)`** — Closes a single payment's open intent at its named provider. Resolves immediately if there is no `providerRef` or the provider is `manual`. Throws `PaymentInFlightError` if the provider reports the intent already succeeded or is mid-flight.
- **`cancelOpenIntentForOrder(orderId)`** — Best-effort wrapper used by the `order.cancelled` listener (wired in `../module.ts`). Looks up the payment, skips `succeeded`/`refunded`, calls `cancelOpenIntent`, and **logs** rather than rethrows on failure (the order is already gone; a provider error cannot stop the cancel).

## Relationships

- **`@modules/orders`** (`index`, `domain/lifecycle`, `domain/totals`, `services/availability`, `config`) — Source of `orderService`, `isPayable`, `orderTotal`, `unavailableLines`, and `shopCurrency`. The payable check delegates to the order's lifecycle owner; the amount is frozen through `orderTotal` to stay consistent with the order serializer and confirmation email.
- **`../providers/index`** — `resolvePaymentProvider()` supplies the active provider for `createIntent`; `providerNamed()` is used by `cancelOpenIntent` to route cancellation to the correct provider.
- **`../repository`** — `paymentRepository.upsertIntent` persists the intent row; `attachProviderRef` stores the provider reference; `findByOrderId` is used by `cancelOpenIntentForOrder`.
- **`../model`** — `PaymentDocument` type used in `cancelOpenIntent`'s signature; `.toJSON()` applied before the response is built.
- **`../module`** — Registers `cancelOpenIntentForOrder` as the `order.cancelled` event listener.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape all HTTP responses.
- **`@infrastructure/i18n`** — `t()` provides user-facing error strings.
- **`@infrastructure/adapters/logger`** — Warn/error logging for unresolved payer and failed best-effort cancels.
- **`@modules/account/tests/contract/api.contract.test.ts`** — Contract-level tests exercise the response shapes and status codes this file produces.

## Notes

- **Payer resolution is never a hard gate.** An unresolvable or erased account still allows payment to proceed (the order's id is persisted unverified). Only a fully detached (`undefined`) account skips the lookup entirely.
- **Availability check is a race backstop, not the primary guard.** The normal door is `orders`' auto-cancel listener. This fresh check against `products` closes the gap between that event firing and a payment already in flight.
- **`clientSecret` is response-only.** It is never stored in the payment row and never read back from the repository; it appears solely in the 201 body.
- **Two cancellation paths with different failure semantics.** `cancelOpenIntent` throws (caller can refuse the request); `cancelOpenIntentForOrder` swallows errors (no request left to refuse). Don't conflate them.
- **Stryker annotations** surround the fallback `return` in `resolvePayerId` and the `.catch` in `cancelOpenIntentForOrder`, marking them as intentionally un-mutated.
