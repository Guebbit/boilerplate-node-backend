---
source: src/modules/payments/services/intent.ts
sha256: bf9993c18d5820185c3f79b1ebb6137135d523582fc15a5182191500a40a34e9
generated_at: 2026-09-23T19:21:07.490424+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/intent.ts

## Purpose

Entry point for the payment-intent flow: creates (or refreshes) the intent for a given order by freezing the amount, verifying the order is still payable and its lines are available, resolving the payer, and obtaining a `clientSecret` from the configured provider. It is the one response in the module that carries a `clientSecret` on the wire, since that value is never stored.

## Key elements

- **`resolvePayerId(orderUserId: string | undefined)`** — Looks up the order's account id against the users service to persist a verified payer id. If the user no longer resolves, it falls back to the raw `orderUserId` (logged as a warning) rather than refusing the payment. Returns `undefined` immediately when the order's account has been detached (erased), so nothing is persisted.
- **`createIntent(orderId, authContext?)`** — Orchestrates the full intent-creation sequence: load order via `orderService.getById` with caller scoping → check `isPayable(status)` → check `unavailableLines(order)` for post-checkout product deactivation → resolve payer id → `paymentRepository.upsertIntent` with `orderTotal` / `shopCurrency` / provider name → `provider.prepare` → `paymentRepository.attachProviderRef` → return `201` with the payment (`.toJSON()`) plus `clientSecret`. Re-asking on an already-paid order yields `409`.

## Relationships

- **`@modules/orders`** (via `orders/index.ts`, `domain/lifecycle.ts`, `domain/totals.ts`, `services/availability.ts`): Consumes `orderService.getById` + `callerScope`, `isPayable`, `orderTotal`, `unavailableLines`, and `shopCurrency`. The amount, payability rule, and line-availability check are all owned by the orders module; this file never re-implements them.
- **`@modules/payments/providers`** (`providers/index.ts`): Calls `resolvePaymentProvider()` to obtain the active provider, then invokes `provider.prepare({amount, currency}, {orderId, paymentId})` to get `providerRef` and `clientSecret`.
- **`@modules/payments/repository.ts`**: Calls `paymentRepository.upsertIntent` to create/refresh the intent row and `paymentRepository.attachProviderRef` to link the provider reference.
- **`@infrastructure/http/response`**: Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types for all return values.
- **`@infrastructure/i18n`**: Calls `t()` for every user-facing message.
- **`@infrastructure/adapters/logger`**: Emits a `logger.warn` when a payer id cannot be resolved to a live account.
- **`services/index.ts`**: Re-exports this module's public API.
- **`services/offline.ts`**: Sibling service in the same directory; shares the module's conventions but handles the offline path separately.
- **`account/tests/contract/api.contract.test.ts`**: Exercises the intent endpoint contractually.

## Notes

- `orderTotal` is used for the intent amount, not a sum of line items alone — shipping is frozen on the order at checkout and included in `orderTotal`.
- `unavailableLines` is checked against the live product catalog, *not* the order's frozen snapshot, to catch the race window between a product's auto-cancel listener firing and a payment already in flight.
- `resolvePayerId` intentionally never rejects: an unresolvable payer degrades to the raw order id (logged) because orders must survive account deletion.
- `clientSecret` is returned in the response body but never persisted; it is the one field that appears on the wire and then disappears.
- The `.toJSON()` call on the stored payment applies the model's `_id → id` and date transforms before spreading into the response payload.
