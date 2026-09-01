# src/modules/wishlist/controllers/get-wishlist.ts

## Purpose

Thin HTTP adapter that exposes the authenticated user's wishlist as a `GET /wishlist` endpoint. It extracts the user ID from the auth context, delegates to the wishlist service, and formats the result into a standard HTTP response. No business logic lives here.

## Key elements

- **`getWishlist(request, response)`** — The sole export. Reads the user ID via `authContextOf(request).id`, calls `wishlistService.wishlistGet(id)`, and on resolution sends the view through `successResponse`. Failures are forwarded to `catchAs(response, 'getWishlist')`.

## Relationships

- **`src/modules/wishlist/service.ts`** — Provides `wishlistService.wishlistGet`, the single business-logic call this controller makes.
- **`src/infrastructure/http/request.ts`** — Supplies `authContextOf`, used to pull the authenticated user's ID from the incoming request.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which serializes the service view into the HTTP body.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-to-HTTP mapping helper.
- **`src/modules/wishlist/routes.ts`** — Upstream consumer that binds `getWishlist` to the `GET /wishlist` route.

## Notes

- Returns **product IDs only** (same shape as the cart); the client is expected to join them against its local product store. Do not add product payloads here without updating the contract.
- Error handling is fully delegated to `catchAs`; there is no try/catch or status-code logic in this file.
