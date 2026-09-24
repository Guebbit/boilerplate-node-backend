---
source: src/modules/wishlist/controllers/delete-wishlist-item.ts
sha256: eae54f4ade03532d1f8c57afa95684d2940483aee63496ee2c1f923ebf022f9b
generated_at: 2026-09-23T19:46:28.531619+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/delete-wishlist-item.ts

## Purpose

Thin HTTP adapter for the `DELETE /wishlist/:productId` endpoint. Validates the product ID, extracts the authenticated user, delegates to `wishlistService.wishlistRemove`, and maps the service result (or rejection) onto the HTTP response. Exists to keep route wiring in `routes.ts` declarative and to isolate Express-specific concerns from the service layer.

## Key elements

- **`deleteWishlistItem`** (exported) — The request handler. Reads `userId` from `request.authContext`, pulls `productId` from route params, validates it with `requireObjectId`, then calls `wishlistService.wishlistRemove`. On success sends `200` with `WishlistResponse` body via `successResponse`; on service rejection (e.g. product not in the caller's list) the `refused` helper sends the appropriate error status; unexpected errors are forwarded to `catchAs`.

## Relationships

- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` (extracts trace/audit context) and `requireObjectId` (validates the `productId` param, short-circuits the response if invalid).
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialize the service's `WishlistResponse` payload.
- **`src/infrastructure/http/controller.ts`** — Imports `refused` (maps service-level rejections to HTTP error responses) and `catchAs` (unified async error catcher with a log prefix).
- **`src/modules/wishlist/service.ts`** — Calls `wishlistService.wishlistRemove(userId, productId, callerContext)`; the sole business-logic dependency.
- **`src/modules/wishlist/routes.ts`** — Registers this handler on the `DELETE /wishlist/:productId` route.
- **`src/types/index.ts`** — Imports the `WishlistResponse` type for the success payload.

## Notes

- Auth is assumed: `request.authContext!.id` uses a non-null assertion, so the upstream auth middleware is expected to have already populated it. No guard exists in this file.
- Removing a product the caller no longer sees is treated as a **404** (stale view), matching the cart-remove contract. This is handled by the `refused` path, not a thrown error.
- Success returns **200** with a body, not 204 — the service includes a `message` field that is forwarded to the client.
