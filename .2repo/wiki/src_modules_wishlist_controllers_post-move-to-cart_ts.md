# src/modules/wishlist/controllers/post-move-to-cart.ts

## Purpose

Express route handler for `POST /wishlist/:productId/move-to-cart`. It validates the product ID, extracts the authenticated user, and delegates to the wishlist service to move one product from the wishlist into the cart (quantity 1, or incremented if already present) while removing it from the wishlist.

## Key elements

- **`postMoveToCart`** *(exported function)* — The sole handler. Reads `userId` from the auth context and `productId` from route params, performs early validation, calls the service, and writes the HTTP response (success or refusal).

## Relationships

- **`@infrastructure/http/request`** — Provides `authContextOf` (extracts the user ID) and `callerContextOf` (forwards caller metadata into the service call).
- **`@infrastructure/http/response`** — Provides `successResponse` to shape the 200 reply with the service's `data` and `message`.
- **`@infrastructure/http/controller`** — Provides `refused` (detects domain-level rejection results) and `catchAs` (uniform error-to-HTTP mapping on the `.catch` branch).
- **`./shared/product-id`** — `malformedProductId` short-circuits the handler with a 400 before any service call if the param is not a valid UUID.
- **`../service`** — `wishlistService.wishlistMoveToCart(userId, productId, callerContext)` is the sole business-logic call; all ordering guarantees (cart write → wishlist removal) live there.
- **`../routes.ts`** — Registers this handler on the `POST /wishlist/:productId/move-to-cart` path.

## Notes

- The handler uses a `.then / .catch` chain rather than `async/await`; the `catchAs` wrapper is the only error path, so any thrown error in the service is funneled through it.
- The deliberate write ordering (cart first, wishlist second) is a **service-layer** invariant, not something the controller enforces. The JSDoc here documents *why* that order matters (recoverability for the shopper) to prevent a future refactor from "optimizing" it away.
- `malformedProductId` writes its own error response and returns `true`; the handler must `return` immediately after a truthy check (it does). Forgetting that guard would fall through to the service call.
