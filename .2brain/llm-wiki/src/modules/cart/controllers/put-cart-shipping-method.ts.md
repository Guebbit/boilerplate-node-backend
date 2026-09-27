---
source: src/modules/cart/controllers/put-cart-shipping-method.ts
sha256: 934f67338ca7dfd95dc420362ae95c64a9fe1a26ec0558ffd45ce2ea69285b58
generated_at: 2026-09-27T14:44:07.562477+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/put-cart-shipping-method.ts

## Purpose

Thin HTTP adapter for `PUT /cart/shipping-method`. It validates the request body, delegates to the cart service to set (or clear with `null`) the shipping method, and returns the re-priced cart. Contains no business logic itself.

## Key elements

- **`putCartShippingMethod`** (exported) — Express handler. Reads `userId` from `request.authContext`, validates the body against the `SetCartShippingMethodBody` Zod schema, calls `cartService.cartShippingMethodSet`, and emits the cart or an error response.
- **Body validation** — `parseBody(SetCartShippingMethodBody, …)` short-circuits with an early return on schema failure.
- **Error / refusal handling** — `refused(response, result)` maps service-level refusals to the correct HTTP status; `catchAs(response, 'setCartShippingMethod')` converts unhandled rejections into a JSON error.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs`, the three HTTP-glue helpers this file relies on for validation, refusal, and catch handling.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse<CartResponse>`, the single success-path serializer.
- **`src/modules/cart/services/index.ts`** — source of `cartService`; this file calls `cartService.cartShippingMethodSet(userId, shippingMethodId)` and consumes its `{ data }` or refusal shape.
- **`src/modules/cart/routes.ts`** — registers `putCartShippingMethod` on the `PUT /cart/shipping-method` route (with the auth middleware that populates `request.authContext`).
- **`src/types/index.ts`** — provides the `CartResponse` and `SetCartShippingMethodRequest` types used in the handler signature and response typing.

## Notes

- `request.authContext!` uses a non-null assertion: the handler assumes an auth middleware has already run and attached the user. Calling this without that middleware will throw at runtime.
- `shippingMethodId` may be `null` in the request body; the service interprets that as "clear the shipping method."
- The `@module` JSDoc header and the inline doc comment are the canonical description of the endpoint's contract; keep them in sync if the behavior changes.
