---
source: src/modules/cart/controllers/post-cart-items.ts
source_sha256: 3e5067991cc4dbc26e062e5ce713fba7ad8fe8814b3a06795f22f9b9cbb1eedb
context_sha256: 942e814761bd6ed473adef161d4e68172a24d5e8968b273858507fad0a4ab15a
generated_at: 2026-11-22T04:30:58.483427+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/post-cart-items.ts

## Purpose
Controller for `POST /cart/items` ("add to cart"). It is a thin HTTP adapter over `cartService.addItem`: it validates the body, calls the service, and turns the result into an HTTP response. If the product has no line in the cart, one is created. If it already has a line, that line's quantity grows by the amount sent. Either way the response is 200 with the whole cart.

## Key elements
- `postCartItems(request, response)`: the Express handler, and the file's only export.
  - It reads `userId` from `request.authContext!.id`, so it assumes auth middleware has already run.
  - It validates the body with `parseBody(AddCartItemBody, ...)` and returns early if validation fails.
  - It calls `cartService.addItem(userId, productId, quantity, callerContextOf(request))`.
  - If `refused(response, result)` reports a refusal, it returns without sending a success response.
  - Otherwise it sends `successResponse<CartResponse>(response, result.data, 200)`.
  - Any rejection goes to `catchAs(response, 'addCartItem')`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `parseBody`, `refused` and `catchAs`. These handle body validation, service refusals and error mapping.
- `src/infrastructure/http/request.ts` supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` supplies `successResponse`, which builds the 200 response.
- `src/modules/cart/services/index.ts` exports `cartService`. Its `addItem` method does the work and decides eligibility.
- `src/types/index.ts` supplies the `CartResponse` and `AddCartItemRequest` types, which type the response and the request body.
- `src/modules/cart/routes.ts` is the neighbor that wires this handler to the route. The handler file does not import it.

## Notes
- It always returns 200 with the full cart, never 201 or a line resource. A line is written through its parent cart and has no URL of its own.
- Repeated calls accumulate. Pressing the button twice adds the quantity twice. `PATCH /cart/items/{productId}` is the endpoint that sets a quantity.
- Eligibility (whether a product can be in a cart at all) is deliberately not checked here. The service owns that rule so that the PATCH endpoint and the wishlist's move-to-cart share it.
- `parseBody` has already refused a `productId` that is not this backend's id (422) by the time the handler destructures the body.
- The body schema `AddCartItemBody` is imported from `@api/schemas.zod`.
