---
source: src/modules/wishlist/controllers/get-wishlist.ts
sha256: 5769f4c25c89ca9f69f727965a82505c161370283734b2b3d0b97ba65a6d59f7
generated_at: 2026-10-29T06:33:40.815992+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/get-wishlist.ts

## Purpose

Thin HTTP adapter that handles the `GET /wishlist` route. It extracts the authenticated user's ID from the request, delegates to `wishlistService.get`, and formats the result as a standard success response. Exists to keep routing, service logic, and HTTP concerns separated.

## Key elements

- **`getWishlist(request, response)`** — The sole export. Reads `request.authContext!.id`, calls `wishlistService.get(id)`, then sends the view via `successResponse<WishlistResponse>`. Errors are funneled through `catchAs(response, 'getWishlist')`.
- The returned payload contains **product IDs only** (same shape as the cart); the client is responsible for joining against its own product store.

## Relationships

- **`src/modules/wishlist/routes.ts`** — Imports and mounts `getWishlist` as the handler for the `GET /wishlist` route.
- **`src/modules/wishlist/service.ts`** — Source of `wishlistService.get`, which performs the actual data retrieval.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard envelope used to serialize the view.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-catcher wrapper.
- **`src/types/index.ts`** — Defines the `WishlistResponse` type that constrains the success payload.

## Notes

- `request.authContext!` uses a non-null assertion — the route is expected to be behind an auth middleware; calling it without an auth context will throw at runtime rather than at compile time.
- The controller is intentionally fire-and-forget on the Express side: it returns the promise chain but never calls `res` synchronously, so middleware downstream should not rely on the response being already sent.
