---
source: src/modules/wishlist/controllers/post-move-to-cart.ts
sha256: 9b9cb932153296620b45c6af865741cf4c3906d5c69f51ab24911b2a345d4e3d
generated_at: 2026-10-15T12:25:52.861279+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/post-move-to-cart.ts

## Purpose

Thin HTTP adapter that wires the `POST /wishlist/:productId/move-to-cart` route to the business logic in `wishlistService.wishlistMoveToCart`. It extracts the product ID from the URL, the user ID from the auth context, and the caller context, then delegates the actual "move one wishlist item into the cart" operation to the service layer.

## Key elements

- **`postMoveToCart(request, response)`** — the sole export. Reads `productId` from the URL params (validated via `requireId`), pulls `userId` from `request.authContext!.id`, calls `wishlistService.wishlistMoveToCart`, and maps the result to an HTTP response.
- **Early return on invalid ID** — if `requireId` fails (missing/malformed), a 404 is sent and the function exits before touching the service.
- **`refused` check** — the service may return a non-throwing "refused" result; the controller inspects it before sending a success response.
- **`catchAs`** — wraps the `.catch` path so unexpected errors are logged and converted to a structured error response under the `postMoveToCart` label.

## Relationships

- **`src/modules/wishlist/service.ts`** — the controller's primary dependency; calls `wishlistService.wishlistMoveToCart(userId, productId, callerContext)` for all business logic.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` to validate and extract the `productId` param, emitting a 404 with the `wishlist.not-found` code on failure.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to build a caller-context object passed into the service.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` to serialize the `WishlistResponse` payload into the HTTP body.
- **`src/infrastructure/http/controller.ts`** — provides the `catchAs` error-catcher and the `refused` result-check helper.
- **`src/modules/wishlist/routes.ts`** — the route file that registers `postMoveToCart` against the `POST /wishlist/:productId/move-to-cart` path.
- **`src/types/index.ts`** — supplies the `WishlistResponse` shape used to type the success response payload.

## Notes

- The controller is intentionally stateless and contains no business rules; all "move-to-cart" semantics (cart line creation/increment, wishlist removal, ordering of writes) live in the service.
- `request.authContext!.id` uses a non-null assertion — the route is expected to sit behind auth middleware; if it is ever mounted unauthenticated this will throw.
- The service's write order (cart first, wishlist second) is a deliberate recoverability choice documented in the controller's doc comment; do not swap it when refactoring.
