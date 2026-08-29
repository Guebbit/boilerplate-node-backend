# src/modules/wishlist/controllers/get-wishlist.ts

## Purpose

Express controller for `GET /wishlist`. It resolves the authenticated user's saved product IDs (not full product objects) and returns them as a JSON success response. The client is expected to join these IDs against its own product store.

## Key elements

- **`getWishlist(request, response)`** — sole export; the route handler. Extracts the caller's user ID via `authContextOf`, calls `wishlistService.wishlistGet(id)`, sends the result with `successResponse`, and funnels any rejection through `catchAs`.

## Relationships

- **`src/modules/wishlist/routes.ts`** — imports `getWishlist` and wires it to the `GET /wishlist` route.
- **`src/modules/wishlist/service.ts`** — provides `wishlistService`, whose `wishlistGet` method performs the actual lookup.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the shared helper for shaping the HTTP reply.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs`, the shared error-to-response mapper.
- **`src/infrastructure/http/request.ts`** — supplies `authContextOf`, which extracts the authenticated user ID from the request.

## Notes

- The response body is an ID list only (mirrors the cart contract); no product details are returned server-side.
- Uses promise-chain (`.then/.catch`) style rather than `async/await`, consistent with the surrounding controller layer.
