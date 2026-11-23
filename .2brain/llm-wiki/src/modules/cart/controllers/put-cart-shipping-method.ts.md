---
source: src/modules/cart/controllers/put-cart-shipping-method.ts
source_sha256: 5ef6a89491a0af93e5b24dbb2efcdbc16d6c87c9672661b21b0401cb799b65a2
context_sha256: d97e806267cbe458feec236b24690be7dbb45bae4eac1ac386a534692fb24c37
generated_at: 2026-11-22T04:31:43.815738+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/put-cart-shipping-method.ts

## Purpose
Express controller for `PUT /cart/shipping-method`. It is a thin HTTP adapter over `cartService.setShippingMethod`. It sets or clears (`null`) the shipping method the cart plans to ship by, and returns the updated cart priced against that choice.

## Key elements
- `putCartShippingMethod(request, response)`: the only export, a request handler. Its flow:
  1. Reads the user id from `request.authContext!.id`. The non-null assertion assumes auth middleware has already run.
  2. Validates `request.body` with `parseBody(SetCartShippingMethodBody, ...)`. `SetCartShippingMethodBody` is a schema imported from `@api/schemas.zod`. If validation fails the handler returns early, since `parseBody` handles the response.
  3. Calls `cartService.setShippingMethod(userId, body.shippingMethodId)`.
  4. If `refused(response, result)` is true, it returns without further output. Otherwise it sends `successResponse<CartResponse>(response, result.data)`.
  5. Any rejection goes to `catchAs(response, 'setCartShippingMethod')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody` (body validation), `refused` (turns a refused service result into an HTTP response) and `catchAs` (error handler tagged with the operation name).
- `src/infrastructure/http/response.ts`: provides `successResponse`, used to send the updated cart.
- `src/modules/cart/services/index.ts`: provides `cartService`, which holds the business logic called here.
- `src/types/index.ts` (imported as `@types`): provides the `CartResponse` and `SetCartShippingMethodRequest` types.
- `src/modules/cart/routes.ts`: the route file that mounts this handler. It is not imported here.

## Notes
- There is no `If-Match` handling. The source comment says this is because the URL has no GET and the cart has its own line rules.
- The handler is not `async`. It returns the promise chain, or `undefined` when body validation fails.
