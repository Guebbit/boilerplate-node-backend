---
source: src/modules/wishlist/controllers/delete-wishlist-item.ts
sha256: 5f7259adae6f61c6dbb0d88b95995439d46ba6a87337f92d8cf75aabfcd4611e
generated_at: 2026-10-29T06:33:34.341410+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/delete-wishlist-item.ts

## Purpose

Thin HTTP adapter for `DELETE /wishlist/items/:productId`. Validates the incoming request, delegates to `wishlistService.remove`, and shapes the Express response. Exists to keep route registration in `routes.ts` declarative while isolating parameter validation and response formatting from the service layer.

## Key elements

- **`deleteWishlistItem`** (exported function) — Route handler. Reads `userId` from `request.authContext`, validates `productId` via `requireId`, calls `wishlistService.remove(userId, productId, callerContext)`, then either sends a `refused` response, a `200` success with `WishlistResponse` data, or a caught error via `catchAs`.

## Relationships

- **`src/modules/wishlist/service.ts`** — Imports `wishlistService` and calls its `.remove` method; this file is the sole HTTP-facing caller for that operation.
- **`src/modules/wishlist/routes.ts`** — Registers `deleteWishlistItem` as the handler for the `DELETE /wishlist/items/:productId` route.
- **`src/infrastructure/http/controller.ts`** — Provides `refused` (handles service-level rejection responses) and `catchAs` (unified error-to-response mapping).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` to validate the `productId` route param; returns early (and ends the request) if the param is missing or malformed.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to derive caller metadata passed into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` to build the typed 200 JSON body.
- **`src/types/index.ts`** — Supplies the `WishlistResponse` type used to type the success payload.

## Notes

- `request.authContext!` uses a non-null assertion; auth middleware is assumed to run before this handler. A missing context will throw at runtime rather than produce a 401 here.
- A wishlist item the caller cannot see (deleted by another session, ownership mismatch, etc.) is surfaced as **404**, matching the cart-remove contract — the caller's view is considered stale.
- `requireId` is configured with the i18n key `'wishlist.not-found'` for its not-found error message; ensure that key exists in the locale files.
