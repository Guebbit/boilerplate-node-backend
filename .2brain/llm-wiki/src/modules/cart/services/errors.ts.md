---
source: src/modules/cart/services/errors.ts
source_sha256: dd459dff544a8dc2fd07e6406b07db2190f546debfa4b9a5fd92c7aa4ac2e87f
context_sha256: abc055afde4548516b5dc8ccf83c24edfa4ccd1f74dcd8fb8861fccb237c513e
generated_at: 2026-11-22T04:35:43.848363+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/errors.ts

## Purpose
Holds refusals that more than one cart service raises, in a single leaf module. The error code and the message are defined once, so the services that raise them cannot drift apart.

## Key elements
- `shippingMethodNotFound()`: returns a `ResponseReject`, built with `generateReject`, with HTTP status 404. It carries one error whose code is `ERROR_CODES.CART_SHIPPING_METHOD_NOT_FOUND` and whose message is `t('cart.shipping-method-not-found')`. It is raised when the named shipping method is not offered by this deployment, both when the method is chosen on the basket and again at checkout.

## Relationships
- `src/infrastructure/http/response.ts`: provides `generateReject` and the `ResponseReject` type used to build the 404 response.
- `src/infrastructure/i18n/index.ts`: provides the `t` function that resolves the message key.
- `src/modules/cart/services/checkout.ts` and `src/modules/cart/services/items.ts`: neighbors in the dependency graph. Per the module doc, they are the cart services that share these refusals, and the code describes the shipping-method case as raised at the basket and at checkout.
- `src/infrastructure/i18n/context.ts`: a graph neighbor, but this file does not import it directly.

## Notes
- The message is produced when `shippingMethodNotFound()` is called, not when the module loads. It is a function rather than a constant, so the `t()` lookup happens at call time.
- The error code comes from `@api/error-codes`.
