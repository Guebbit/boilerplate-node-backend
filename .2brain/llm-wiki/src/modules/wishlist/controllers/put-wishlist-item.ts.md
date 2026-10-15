---
source: src/modules/wishlist/controllers/put-wishlist-item.ts
sha256: b883acb5f1e568d476c5f9d00bcc14dcb1b304e350357715da8a5a83d815b6ec
generated_at: 2026-10-15T12:26:03.310150+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/put-wishlist-item.ts

## Purpose

HTTP controller for `PUT /wishlist/:productId`. Acts as a thin adapter: extracts the authenticated user and validated product ID from the request, delegates to `wishlistService.wishlistAdd`, and maps the result to an HTTP response. No business logic lives here.

## Key elements

- **`putWishlistItem(request, response)`** (exported) — The controller handler. Reads `request.authContext!.id` for the user, validates `productId` via `requireId`, then calls `wishlistService.wishlistAdd(userId, productId, callerContextOf(request))`. On success returns `200` with a `WishlistResponse` body; on service refusal or thrown error, delegates to `refused` / `catchAs`.
- **`requireId`** (from `@infrastructure/http/ids`) — Validates the `:productId` route param; short-circuits with a 404 (`wishlist.product-not-found`) if missing/invalid.
- **`callerContextOf`** (from `@infrastructure/http/request`) — Builds a caller-context object from the request for the service layer.
- **`refused` / `catchAs`** (from `@infrastructure/http/controller`) — Standard response-mapping helpers for service rejections and caught errors.
- **`successResponse<WishlistResponse>`** (from `@infrastructure/http/response`) — Serialises the success payload with status 200 and an optional message.

## Relationships

- **`src/modules/wishlist/service.ts`** — Consumes `wishlistService.wishlistAdd`, the actual add-to-wishlist operation.
- **`src/modules/wishlist/routes.ts`** — Registers `putWishlistItem` as the handler for the `PUT /wishlist/:productId` route.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error → HTTP) and `refused` (service refusal → HTTP) used in the promise chain.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for route-parameter validation.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to derive caller metadata from the request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for structured success replies.
- **`src/types/index.ts`** — Supplies the `WishlistResponse` type used as the success-payload contract.

## Notes

- **PUT idempotency by design:** saving an already-saved product returns `200` (not `409`/`422`). The comment cites RFC 9110 §9.3.4 and compares the pattern to GitHub's `PUT`/`DELETE /user/starred/{owner}/{repo}`.
- **Auth assumption:** `request.authContext!` uses a non-null assertion — the file assumes an upstream auth middleware has populated it. There is no explicit guard here.
- **No request body:** the handler ignores `request.body` entirely; the resource is identified solely by the URI path.
