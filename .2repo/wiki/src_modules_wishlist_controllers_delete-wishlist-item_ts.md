# src/modules/wishlist/controllers/delete-wishlist-item.ts

## Purpose

Express controller handler for `DELETE /wishlist/:productId`. It extracts the caller's identity, validates the product ID, delegates removal to the wishlist service, and shapes the HTTP response (200 success, 404 for items the caller cannot see, or error).

## Key elements

- **`deleteWishlistItem`** (exported) — The sole export. An async-by-promise handler that:
  - Reads `userId` via `authContextOf(request).id`.
  - Validates `productId` with `malformedProductId`; short-circuits if invalid.
  - Calls `wishlistService.wishlistRemove(userId, productId, callerContextOf(request))`.
  - On refusal, delegates to `refused(response, result)`.
  - On success, sends 200 with `result.data` and `result.message`.
  - Catches unhandled rejections via `catchAs(response, 'deleteWishlistItem')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `catchAs` and `refused` helpers used for uniform error/refusal handling.
- **`src/infrastructure/http/request.ts`** — Source of `authContextOf` (extracts user identity) and `callerContextOf` (propagates caller context into the service call).
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`, which serializes the 200 payload.
- **`src/modules/wishlist/controllers/shared/product-id.ts`** — Provides `malformedProductId`, the shared validation guard for product ID params.
- **`src/modules/wishlist/routes.ts`** — Registers `deleteWishlistItem` as the handler for the `DELETE /wishlist/:productId` route.
- **`src/modules/wishlist/service.ts`** — Exposes `wishlistService.wishlistRemove`, the domain operation this controller delegates to.

## Notes

- The JSDoc calls out an intentional contract: removing a product the caller cannot currently see returns **404**, mirroring the cart-remove behavior so clients know their view is stale.
- Success is returned as **200** (not 204), carrying both `data` and a `message` from the service result.
- `callerContextOf(request)` is forwarded into the service call — any audit/tenancy context must be set on the request before this handler runs.
