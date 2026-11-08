---
source: src/modules/wishlist/controllers/get-wishlist.ts
sha256: 5769f4c25c89ca9f69f727965a82505c161370283734b2b3d0b97ba65a6d59f7
generated_at: 2026-11-08T09:11:57.363869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/get-wishlist.ts

## Purpose

Thin HTTP adapter for the `GET /wishlist` endpoint. It extracts the authenticated user's id, delegates to `wishlistService.get`, and shapes the result into a standard success response. The wishlist payload contains product ids only; the client is expected to join them against its own product store.

## Key elements

- **`getWishlist`** (exported function) — Express handler that calls `wishlistService.get(request.authContext!.id)`, sends the result via `successResponse<WishlistResponse>`, and routes any rejection through `catchAs(response, 'getWishlist')`.

## Relationships

- **`src/modules/wishlist/service.ts`** — Imports `wishlistService` and calls its `.get(userId)` method; the sole business-logic dependency.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialize the service's return value into the HTTP reply.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` to attach a unified error handler tagged with the controller name.
- **`src/types/index.ts`** — Imports the `WishlistResponse` type used as the generic parameter of `successResponse`.
- **`src/modules/wishlist/routes.ts`** — Expected consumer that mounts `getWishlist` on the `GET /wishlist` route (this file exports the handler; routes.ts wires it to Express).

## Notes

- The `!` on `request.authContext!.id` means the route is expected to be behind an auth middleware; there is no defensive null-check in this controller.
- Follows the module's controller convention: no business logic here — just auth-context extraction, service call, and response/error delegation.
