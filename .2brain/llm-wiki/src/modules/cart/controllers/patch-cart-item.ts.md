---
source: src/modules/cart/controllers/patch-cart-item.ts
source_sha256: 70b99c0d0316ec8790d0e19089c2b0e76e28801d10063e9d460f6e8476d809ed
context_sha256: d4ddd006ddf877c1e8aaa621699678461a7b1244f89ab068a3ac075a5e840057
generated_at: 2026-11-22T04:30:46.846170+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/patch-cart-item.ts

## Purpose
Controller for `PATCH /cart/items/:productId`. It is a thin HTTP adapter over `cartService.updateItemQuantity`. It sets the quantity of a line the cart already holds and returns the updated cart.

## Key elements
- `patchCartItem(request, response)`: the Express handler, and the file's only export.
  - Reads the user id from `request.authContext!.id`.
  - Validates the `productId` path segment with `requireId`. A malformed id answers `products.not-found` (surface `path`).
  - Parses the body with `parseBody(UpdateCartItemByProductIdBody, ...)`. The body carries only `quantity`.
  - Calls `cartService.updateItemQuantity(userId, productId, quantity, callerContextOf(request))`.
  - If `refused(response, result)` is true, it stops, because the refusal has already been written to the response. Otherwise it sends `successResponse<CartResponse>(response, result.data)`.
  - Unexpected errors are handled by `catchAs(response, 'updateCartItemByProductId')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`.
- `src/infrastructure/http/ids.ts`: supplies `requireId`, which validates the path id.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: supplies `successResponse`.
- `src/modules/cart/services/index.ts`: provides `cartService`, whose `updateItemQuantity` holds the business logic.
- `src/types/index.ts`: provides the `CartResponse` and `UpdateCartItemByProductIdRequest` types.
- `src/modules/cart/routes.ts`: the route module that wires this handler to the path (the file itself doesn't show the wiring).

## Notes
- This is an update only. A line the cart does not hold returns 404 `cart.item-not-found`.
- A product the storefront wouldn't show returns the same 404 as `POST /cart/items`, and it comes from the same place, `upsertCartItem`.
- There is no `If-Match` handling. The doc comment gives two reasons: there is no GET on this URL, and the cart has its own line rules.
- The handler uses early `return` after `requireId` and `parseBody` fail, and relies on those helpers to have already written the error response.
- `request.authContext!` is a non-null assertion, so it assumes auth middleware runs before this handler.
- The request body is validated with the `UpdateCartItemByProductIdBody` zod schema, imported from `@api/schemas.zod`.
