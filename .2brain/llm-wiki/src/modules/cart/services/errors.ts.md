---
source: src/modules/cart/services/errors.ts
sha256: dd459dff544a8dc2fd07e6406b07db2190f546debfa4b9a5fd92c7aa4ac2e87f
generated_at: 2026-10-29T03:24:12.101802+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/errors.ts

## Purpose

Centralizes the refusal responses that more than one cart service raises, so the error code and user-facing message live in a single place and cannot drift between the services that depend on them.

## Key elements

- **`shippingMethodNotFound(): ResponseReject`** — Returns a 404 `ResponseReject` carrying `ERROR_CODES.CART_SHIPPING_METHOD_NOT_FOUND` and the i18n string `cart.shipping-method-not-found`. Used when a caller selects a shipping method the deployment does not offer.

## Relationships

- **`@infrastructure/http/response`** — Provides `generateReject` (the helper that builds the `ResponseReject` object) and the `ResponseReject` type that every export here returns.
- **`@infrastructure/i18n`** (barrel: `i18n/index.ts` → `i18n/context.ts`) — Supplies the `t()` function used to resolve the human-readable message at call time.
- **`src/modules/cart/services/items.ts`** — Imports `shippingMethodNotFound` to reject basket-level shipping-method selection.
- **`src/modules/cart/services/checkout.ts`** — Imports `shippingMethodNotFound` to reject the same invalid choice at checkout, guaranteeing an identical code + message.

## Notes

- The file is intentionally a **leaf**: it depends on infrastructure and a shared error-codes constant but is never imported by other cart-internal services beyond the two listed above.
- Every export follows the same shape: a zero-arg function returning a pre-built `ResponseReject`, so callers simply do `throw shippingMethodNotFound()`.
- The i18n key (`cart.shipping-method-not-found`) must exist in the translation catalog; a missing key would surface as a runtime fallback rather than a compile-time error.
