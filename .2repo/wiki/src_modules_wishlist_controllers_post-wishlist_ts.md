# src/modules/wishlist/controllers/post-wishlist.ts

## Purpose
Thin HTTP adapter for `POST /wishlist`. It extracts the authenticated user and validated product ID from the request, delegates the business logic to `wishlistService.wishlistAdd`, and shapes the HTTP response. The operation is idempotent: re-saving an already-saved product returns the same `200` rather than an error.

## Key elements
- **`postWishlist`** *(exported)* — The sole handler. Accepts an Express `Request<unknown, unknown, AddWishlistItemRequest>` and `Response`. Flow:
  1. Reads `userId` from `authContextOf(request)`.
  2. Validates the raw body against the Zod schema `AddWishlistItemBody` via `parseBody`; short-circuits with a 400-equivalent if invalid.
  3. Checks `productId` with `isValidObjectId`; rejects with **422** (not 404) when the ID is malformed.
  4. Calls `wishlistService.wishlistAdd(userId, productId, callerContextOf(request))`.
  5. On resolution, checks `refused(response, result)` for a service-level rejection, otherwise emits `successResponse` with `200`.
  6. On rejection, delegates to `catchAs(response, 'postWishlist')`.

## Relationships
- **`src/modules/wishlist/service.ts`** — Provides `wishlistService.wishlistAdd`, the sole business-logic call this controller makes.
- **`src/modules/wishlist/routes.ts`** — Registers `postWishlist` as the handler for the `POST /wishlist` route.
- **`src/infrastructure/http/controller.ts`** — Supplies the three helper functions used here: `parseBody`, `refused`, and `catchAs`.
- **`src/infrastructure/http/request.ts`** — Supplies `authContextOf` (user identity), `callerContextOf` (caller metadata passed to the service), and `isValidObjectId`.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` and `rejectResponse` for consistent response shaping.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides the `t()` translation function used for the 422 error message (`generic.error-missing-data`).
- **`src/types/index.ts`** — Defines the `AddWishlistItemRequest` type used in the Express `Request` generic.

## Notes
- The 422 status for a malformed ObjectId is intentional: the request shape is valid, but the *value* is unusable. Using 404 would conflate "bad input" with "resource not found."
- `parseBody` both validates (Zod) *and* writes the error response; the `if (!body) return` guard is the only control-flow branch after that call.
- The service call returns a `Promise`; the controller does not use `async/await` but chains `.then`/`.catch` instead.
- `callerContextOf(request)` is forwarded to the service, suggesting downstream logic (e.g. rate-limiting, analytics) consumes caller metadata beyond the user ID.
