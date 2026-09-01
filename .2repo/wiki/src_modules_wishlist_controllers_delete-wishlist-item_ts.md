# src/modules/wishlist/controllers/delete-wishlist-item.ts

## Purpose

Thin HTTP adapter that handles `DELETE /wishlist/:productId`. It extracts the authenticated user and product ID from the request, validates the ID format, and delegates the actual removal to `wishlistService.wishlistRemove`, then maps the service result to a structured HTTP response.

## Key elements

- **`deleteWishlistItem`** (exported) — The sole export. Accepts Express `Request<{ productId: string }>` and `Response`. Validates `productId` via `isValidObjectId` (422 on failure), calls `wishlistService.wishlistRemove(userId, productId, callerContextOf(request))`, and returns either a 200 with data/message or a refused/error response.

## Relationships

- **`@infrastructure/http/controller`** — Supplies `catchAs` (unified error-to-response mapping) and `refused` (short-circuits when the service signals the caller lacks access).
- **`@infrastructure/http/request`** — Supplies `authContextOf` (extracts user ID), `callerContextOf` (passes downstream context to the service), and `isValidObjectId` (format guard).
- **`@infrastructure/http/response`** — Supplies `successResponse` (200 envelope) and `rejectResponse` (error envelope with status + messages).
- **`@infrastructure/i18n`** — Supplies the `t` translator for user-facing error strings.
- **`../service`** — Provides `wishlistService.wishlistRemove`, the actual domain operation this controller wraps.
- **`../routes`** — Wires this controller to the `DELETE /wishlist/:productId` path in the wishlist router.

## Notes

- An invalid ObjectId yields **422** (not 404), deliberately signaling "malformed value" rather than "not found." A valid-but-unseen product ID still returns 404 via the service's `refused` path.
- The `refused` check sits *before* `successResponse`; if the service marks the result as refused (e.g., product not in this user's wishlist), the response is sent immediately and the success branch is skipped.
- Error handling is fully delegated to `catchAs(response, 'deleteWishlistItem')` — no manual `try/catch` or per-error mapping in this file.
