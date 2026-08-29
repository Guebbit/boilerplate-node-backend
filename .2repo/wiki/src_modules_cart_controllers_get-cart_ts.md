# src/modules/cart/controllers/get-cart.ts

## Purpose

Controller handler for the `GET /cart` endpoint. It extracts the authenticated user's identity and caller context from the request, delegates the cart lookup to the cart service, and writes the result (or error) back to the HTTP response.

## Key elements

- **`getCart(request, response)`** (exported) — The only export. Receives Express `Request`/`Response`, calls `cartService.cartGetForView(authId, callerContext)`, sends `successResponse` on resolve, and routes rejections through `catchAs(response, 'getCart')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — Consumes `cartService.cartGetForView`, which performs the actual cart retrieval.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to serialize the happy-path reply.
- **`src/infrastructure/http/controller.ts`** — Uses `catchAs` to normalize any thrown/rejected error into a consistent HTTP error response tagged with the `"getCart"` label.
- **`src/infrastructure/http/request.ts`** — Uses `authContextOf` to pull the authenticated user id and `callerContextOf` to pull additional caller metadata from the request.
- **`src/modules/cart/routes.ts`** — Registers `getCart` as the handler for the `GET /cart` route (upstream of this function in the request lifecycle).

## Notes

- Authentication is enforced **before** this handler runs (per the doc comment); the controller itself performs no auth check and assumes `authContextOf` will succeed.
- Error handling is fully delegated to `catchAs`—there is no inline `try/catch`. The second argument (`'getCart'`) is the label used in the error payload or logging.
- The service call is awaited via `.then/.catch` rather than `async/await`, consistent with the project's controller convention.
