# src/modules/cart/controllers/get-cart.ts

## Purpose

Thin HTTP adapter that handles the `GET /cart` endpoint by delegating to the cart service layer and formatting the result into an HTTP response. It exists to keep transport concerns (Express request/response, auth extraction, error catching) separate from business logic.

## Key elements

- **`getCart(request: Request, response: Response)`** — The sole export. Reads the authenticated user's ID and caller context from the request, calls `cartService.cartGetForView`, sends the cart via `successResponse`, and routes any rejection through `catchAs(response, 'getCart')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — Imports `cartService`; calls its `cartGetForView(userId, callerContext)` method to fetch the cart for the view layer.
- **`src/infrastructure/http/request.ts`** — Uses `authContextOf(request)` to extract the authenticated user's ID and `callerContextOf(request)` to pass caller metadata to the service.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse(response, cart)` to serialize and send the 200 payload.
- **`src/infrastructure/http/controller.ts`** — Uses `catchAs(response, 'getCart')` as the unified error handler in the `.catch` branch.
- **`src/modules/cart/routes.ts`** — The route definition that wires `getCart` to the `GET /cart` path (authentication middleware runs before this controller is invoked).

## Notes

- No in-controller auth check: the file's docblock states authentication is enforced upstream (in the route/middleware), so `authContextOf(request).id` is assumed to be present.
- The function uses a promise chain (`.then`/`.catch`) rather than `async`/`await`, consistent with the project's `catchAs` pattern.
- `catchAs` is passed the string `'getCart'`, which likely serves as a log/trace label for error identification.
