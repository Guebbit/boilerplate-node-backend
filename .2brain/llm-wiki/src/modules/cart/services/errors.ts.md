---
source: src/modules/cart/services/errors.ts
sha256: dd459dff544a8dc2fd07e6406b07db2190f546debfa4b9a5fd92c7aa4ac2e87f
generated_at: 2026-11-08T05:16:50.279863+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/errors.ts

## Purpose

Single source of truth for HTTP rejection responses raised by multiple cart services (basket and checkout). By centralising the code + message pair in one leaf module, the file guarantees that any service raising the same business error returns identical status, error code, and user-facing text.

## Key elements

- **`shippingMethodNotFound()`** — Returns a `ResponseReject` with HTTP 404, error code `ERROR_CODES.CART_SHIPPING_METHOD_NOT_FOUND`, and an i18n-translated message (`cart.shipping-method-not-found`). Used when the caller requests a shipping method not offered by this deployment.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `generateReject` (factory for the `ResponseReject` shape) and the `ResponseReject` type used in the function signature.
- **`src/infrastructure/i18n/index.ts`** — Exports the `t` translation function used to resolve the user-facing error message at call time.
- **`src/infrastructure/i18n/context.ts`** — Underlying locale context that backs the `t` function.
- **`src/modules/cart/services/items.ts`** — Consumes `shippingMethodNotFound()` when a shipping method is selected on the basket.
- **`src/modules/cart/services/checkout.ts`** — Consumes `shippingMethodNotFound()` again at checkout, ensuring the same 404/code/message is returned.

## Notes

- The module deliberately has **no state and no imports from other cart services**, keeping it a pure leaf so it can't create a circular dependency.
- Error messages are resolved via `t(...)` at call time (inside the function body), so the locale is read when the response is actually generated, not at module-load time.
- Adding a new shared cart error means adding one more `export const … = (): ResponseReject => generateReject(…)` here and wiring the same import into every service that should raise it.
