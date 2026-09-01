# src/modules/wishlist/controllers/post-move-to-cart.ts

## Purpose

Thin Express controller for `POST /wishlist/:productId/move-to-cart`. It validates the `productId` param, extracts auth/caller context, and delegates the actual move-to-cart business logic to `wishlistService.wishlistMoveToCart`. The file contains no domain logic itself — it is purely the HTTP adapter layer.

## Key elements

- **`postMoveToCart`** (exported const) — The sole export. Accepts an Express `Request<{ productId: string }>` and `Response`. Performs:
  1. `productId` validation via `isValidObjectId`; rejects with **422** (not 404) when malformed.
  2. Delegation to `wishlistService.wishlistMoveToCart(userId, productId, callerContext)`.
  3. Result handling via `refused` / `successResponse` and error handling via `catchAs`.

## Relationships

- **`src/infrastructure/http/request.ts`** — Source of `authContextOf`, `callerContextOf`, and `isValidObjectId` used to extract identity and validate the param.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse` and `rejectResponse` for structured JSON replies.
- **`src/infrastructure/http/controller.ts`** — Source of `catchAs` (standard error-to-HTTP mapping) and `refused` (short-circuit for service-level rejections).
- **`src/infrastructure/i18n/index.ts`** — Provides the `t` function for localised error messages.
- **`src/modules/wishlist/service.ts`** — The sole business-logic dependency; `wishlistMoveToCart` performs the cart write → wishlist removal sequence.
- **`src/modules/wishlist/routes.ts`** — Expected consumer that registers `postMoveToCart` as the handler for the `POST /wishlist/:productId/move-to-cart` route.

## Notes

- **422 for malformed IDs, not 404.** The convention here is deliberate: the request is syntactically valid but the value is unusable. Callers rely on this distinction to signal "malformed" vs. "not found" back to the client.
- **Operation order lives in the service, not here.** The cart write happens before wishlist removal; the controller only passes data through. Do not reorder or add side-effects in this file.
- **`refused` short-circuit.** If the service returns a "refused" result (e.g. product no longer in wishlist), the controller returns early via `refused` without calling `successResponse`. Check that helper's contract before modifying the `.then` block.
