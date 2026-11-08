---
source: src/modules/wishlist/controllers/delete-wishlist-item.ts
sha256: 5f7259adae6f61c6dbb0d88b95995439d46ba6a87337f92d8cf75aabfcd4611e
generated_at: 2026-11-08T09:11:50.729628+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/delete-wishlist-item.ts

## Purpose
Thin HTTP adapter for `DELETE /wishlist/items/:productId`. It extracts the authenticated user and product ID from the request, delegates to `wishlistService.remove`, and shapes the response (200 with the updated wishlist, or 404 / error) without containing business logic.

## Key elements
- **`deleteWishlistItem(request, response)`** — the sole export. Validates the `productId` route param, calls `wishlistService.remove(userId, productId, callerContext)`, and returns a `200` with `WishlistResponse` on success. Handles two failure paths: a *refused* result (item not in this user's wishlist → 404, per `refused`) and a thrown error (→ `catchAs` serialises it).

## Relationships
- **`src/infrastructure/http/controller.ts`** — imports `catchAs` (uniform error serialisation in the `.catch` branch) and `refused` (detects the service's "not-found for this user" result so the controller can short-circuit with a 404).
- **`src/infrastructure/http/ids.ts`** — imports `requireId` to validate the `productId` param; returns a 404 with i18n key `wishlist.not-found` and stops execution if the param is missing/invalid.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to derive the caller context (locale, etc.) passed into the service call.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to emit the JSON 200 body.
- **`src/modules/wishlist/service.ts`** — imports `wishlistService` and calls its `.remove` method; this is the only business-logic dependency.
- **`src/modules/wishlist/routes.ts`** — the route table that maps `DELETE /wishlist/items/:productId` to this controller (consumer side; this file does not import it).
- **`src/types/index.ts`** — imports `WishlistResponse` as the generic type parameter for the success response shape.

## Notes
- `request.authContext!.id` uses a non-null assertion — an upstream auth middleware is assumed to have populated it; this controller does not guard against a missing context.
- The 404 contract is intentional: if the item is not in *this* user's wishlist the response is 404 (not 409 or a silent 200), mirroring the cart-remove semantics per the in-code comment.
- The controller is a plain function (no class); it is wired via `routes.ts` rather than a framework controller decorator.
