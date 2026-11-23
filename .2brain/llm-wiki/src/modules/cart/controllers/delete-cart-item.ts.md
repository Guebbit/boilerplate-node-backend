---
source: src/modules/cart/controllers/delete-cart-item.ts
generated_at: 2026-11-22T04:30:19.227298+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/delete-cart-item.ts

## Purpose
Controller for `DELETE /cart/items/:productId`. It is a thin HTTP adapter over `cartService.removeItemById`. It removes one product from the authenticated user's cart and returns the updated cart.

## Key elements
- `deleteCartItem(request, response)`: the exported Express handler.
  - Reads the user id from `request.authContext!.id`. The non-null assertion assumes auth middleware has already run.
  - Validates the `productId` path param with `requireId`. If the param is invalid, `requireId` has already answered the request, so the handler returns early.
  - Calls `cartService.removeItemById(userId, productId, callerContextOf(request))`.
  - If `refused(response, result)` reports that the service refused the request, it stops. Otherwise it sends `successResponse<CartResponse>(response, result.data, 200)`.
  - Rejections are handled by `.catch(catchAs(response, 'deleteCartItem'))`.

## Relationships
- `src/modules/cart/services/index.ts` (`cartService`): provides `removeItemById`. Per the file's doc comment, the service returns a 404 if the item is not in the cart.
- `src/infrastructure/http/ids.ts` (`requireId`): validates the path segment. It is configured with `notFound: 'cart.item-not-found'`, `name: 'productId'` and `surface: 'path'`.
- `src/infrastructure/http/request.ts` (`callerContextOf`): builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` (`successResponse`): formats the 200 response.
- `src/infrastructure/http/controller.ts` (`refused`, `catchAs`): handle service refusals and thrown errors.
- `src/types/index.ts` (`CartResponse`): the response payload type.
- `src/modules/cart/routes.ts`: presumably where this handler is mounted. That file is not shown here.

## Notes
- A malformed `productId` returns the same 404 message key (`cart.item-not-found`) as a product that is not in the cart. The two cases are indistinguishable to the client.
- The path segment is the only source of `productId`.
- The handler returns early without a value on the validation and refusal paths. This relies on the helpers having already written the response.
