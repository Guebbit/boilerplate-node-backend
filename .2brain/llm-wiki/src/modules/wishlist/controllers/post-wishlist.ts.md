---
source: src/modules/wishlist/controllers/post-wishlist.ts
sha256: 4260815f3f7bb0c6b2c83ce4f806baec0e4683b87536f96f42e39cc6951c4fec
generated_at: 2026-09-23T19:46:53.777211+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/post-wishlist.ts

## Purpose
Thin HTTP adapter for the `POST /wishlist` endpoint. It validates the incoming request body, extracts the authenticated user and product identifiers, delegates to `wishlistService.wishlistAdd`, and maps the result to an HTTP response. Exists so the service layer stays transport-agnostic.

## Key elements
- **`postWishlist`** *(exported)* — The sole handler. Receives an Express `Request`/`Response`, parses and validates the body via `AddWishlistItemBody` (Zod), asserts `productId` is a valid ObjectId, calls `wishlistService.wishlistAdd(userId, productId, callerContextOf(request))`, and responds with `200` on success or a refusal on failure.
- **`AddWishlistItemBody`** (imported from `@api/schemas.zod`) — Zod schema used to validate and shape the request body into `AddWishlistItemRequest`.
- **Idempotency** — By design, re-adding an already-saved product returns the same `200` response rather than an error (documented in the module-level JSDoc).

## Relationships
- **`src/infrastructure/http/controller.ts`** — Provides the `parseBody`, `refused`, and `catchAs` helpers used for body validation, domain-refusal mapping, and error serialization.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` (extracts caller metadata from the request) and `requireObjectId` (validates the `productId` field is a valid ObjectId, writing a `400` and short-circuiting if not).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which serializes the service result into the final HTTP `200` body.
- **`src/modules/wishlist/routes.ts`** — Registers `postWishlist` as the handler for the `POST /wishlist` route.
- **`src/modules/wishlist/service.ts`** — Source of `wishlistService.wishlistAdd`, the domain operation this controller delegates to.
- **`src/types/index.ts`** — Supplies the `AddWishlistItemRequest` and `WishlistResponse` types used for typing the controller's generic parameters and response payload.

## Notes
- The controller assumes `request.authContext` is always present (non-null assertion on `.id`). Authentication is enforced upstream by middleware, not here.
- `parseBody` and `requireObjectId` both write an error response and return a falsy value to signal "stop"; the handler must `return` immediately in that case (it does).
- Error handling is delegated entirely to `catchAs(response, 'postWishlist')` — no inline `try/catch` or status-code logic beyond the success/refused paths.
- The file imports Express types directly rather than through an internal abstraction, consistent with the rest of the HTTP infrastructure.
