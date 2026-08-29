# src/modules/cart/controllers/delete-cart.ts

## Purpose

HTTP handler for `DELETE /cart`. Authenticates the caller, delegates to the cart service to remove **all** items from that user's cart, and returns the resulting cart state (or an error).

## Key elements

- **`deleteCart(request, response)`** — The sole export. Reads the `userId` from the request's auth context, calls `cartService.cartRemove(userId, callerContextOf(request))`, and responds with either `successResponse(response, cart)` or a caught error via `catchAs(response, 'deleteCart')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the unified error-capture helper used in the `.catch` branch.
- **`src/infrastructure/http/request.ts`** — Supplies `authContextOf` (extracts the authenticated user id) and `callerContextOf` (extracts caller metadata forwarded to the service).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which formats the JSON success reply.
- **`src/modules/cart/services/index.ts`** — Provides `cartService`, whose `cartRemove` method performs the actual item-deletion logic.
- **`src/modules/cart/routes.ts`** — Registers `deleteCart` as the handler for the `DELETE /cart` route.

## Notes

- Uses a Promise `.then`/`.catch` chain rather than `async`/`await`, consistent with the rest of the HTTP layer.
- `callerContextOf` is passed alongside `userId` into the service call — the service (or its downstream adapters) may rely on it for idempotency keys, tracing, or scoping; it is not used locally in this file.
- The operation is destructive and total: it clears the entire cart, not a single line-item.
