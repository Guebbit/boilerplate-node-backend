---
source: src/modules/wishlist/controllers/get-wishlist.ts
sha256: af85424dace6c774ee8bd645ae8b243f7c0f679ff8aebc56c02a7d1cce8320de
generated_at: 2026-09-23T19:46:35.988637+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/get-wishlist.ts

## Purpose

Thin HTTP adapter for the `GET /wishlist` endpoint. It extracts the authenticated user's ID from the request, delegates to `wishlistService.wishlistGet`, and formats the result as a standard success/error response. Contains no business logic.

## Key elements

- **`getWishlist`** (exported) — Express handler that calls `wishlistService.wishlistGet(request.authContext!.id)`, sends the view via `successResponse<WishlistResponse>`, and routes failures through `catchAs(response, 'getWishlist')`.
- **`WishlistResponse`** (type import) — shapes the payload; the file's doc comment notes it carries product _ids only_, mirroring the cart pattern.

## Relationships

- **`src/modules/wishlist/service.ts`** — Primary dependency. `getWishlist` calls `wishlistService.wishlistGet(userId)` to fetch the saved-product list.
- **`src/modules/wishlist/routes.ts`** — Registers `getWishlist` as the handler for the `GET /wishlist` route.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard envelope wrapper for successful JSON replies.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-serialization helper used in the `.catch` branch.
- **`src/types/index.ts`** — Source of the `WishlistResponse` type that parameterizes the response envelope.

## Notes

- `request.authContext!` uses a non-null assertion; the controller assumes an upstream auth middleware has already populated it. Calling this route without that middleware will throw at the `!` dereference.
- The response contains product IDs only — the client is expected to join them against its own product store. Do not add product fields to the view model here.
- The error tag passed to `catchAs` (`'getWishlist'`) is used for logging/tracing; keep it consistent if you rename the function.
