---
source: src/modules/wishlist/controllers/post-wishlist-items.ts
sha256: 838246bc7ebe8cedb83db41fdd9aa8d3ad7c16b77b83646f7a87995116ab727d
generated_at: 2026-11-08T09:12:16.516751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/post-wishlist-items.ts

## Purpose

Thin HTTP adapter that handles `POST /wishlist/items`. It validates the incoming body, extracts the authenticated user's ID, and delegates to `wishlistService.add`, then serialises the result. It exists so the wishlist module's route table stays declarative and all request/response plumbing stays in one place.

## Key elements

- **`postWishlistItems(request, response)`** — the sole export. Reads `request.authContext!.id`, validates the body against the `CreateWishlistItemBody` zod schema, calls `wishlistService.add(userId, productId, callerContext)`, and sends either a `200` with the full wishlist (`WishlistResponse`) or a refusal/error.
- **`parseBody`** (from `@infrastructure/http/controller`) — validates `request.body` against the zod schema; responds `422` and returns `null` on failure (e.g. foreign `productId`).
- **`refused`** (from `@infrastructure/http/controller`) — inspects the service result; if the service signalled a refusal, writes the appropriate error response and the handler stops.
- **`successResponse`** (from `@infrastructure/http/response`) — sends `200` with the deserialised wishlist payload.
- **`catchAs`** (from `@infrastructure/http/controller`) — catches unexpected thrown errors and maps them to a standard error response tagged `'createWishlistItem'`.

## Relationships

- **`src/modules/wishlist/service.ts`** — calls `wishlistService.add`; the only domain logic this file invokes.
- **`src/modules/wishlist/routes.ts`** — registers `postWishlistItems` as the handler for `POST /wishlist/items`.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, `catchAs` helpers that handle validation, refusal signalling, and error catching.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to extract caller metadata forwarded to the service.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the `200` reply.
- **`src/types/index.ts`** — provides the `CreateWishlistItemRequest` and `WishlistResponse` type aliases used for typing the Express generics and the response payload.

## Notes

- Returns **200**, not 201: the operation is idempotent (re-saving an already-saved product returns the same wishlist with no duplicate side-effects), so a double-clicked "heart" is not an error.
- No `Location` header is set on success.
- The response body is the **entire wishlist**, not just the newly added item.
- `request.authContext!.id` uses a non-null assertion — the auth middleware is expected to have already populated this; if it hasn't, the error surfaces as an unhandled exception caught by `catchAs`.
