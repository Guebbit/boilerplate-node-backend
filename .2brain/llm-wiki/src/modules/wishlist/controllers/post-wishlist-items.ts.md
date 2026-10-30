---
source: src/modules/wishlist/controllers/post-wishlist-items.ts
sha256: 838246bc7ebe8cedb83db41fdd9aa8d3ad7c16b77b83646f7a87995116ab727d
generated_at: 2026-10-29T06:33:58.091095+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/controllers/post-wishlist-items.ts

## Purpose

HTTP adapter for `POST /wishlist/items`. Validates the request body against a Zod schema, extracts the authenticated user and caller context, delegates the write to `wishlistService.add`, and returns the full wishlist as a `200` response.

## Key elements

- **`postWishlistItems(request, response)`** — the sole export. Handles the full request lifecycle: body validation → service call → success or error response.

## Relationships

- **`src/modules/wishlist/routes.ts`** — registers this function as the handler for `POST /wishlist/items`.
- **`src/modules/wishlist/service.ts`** — calls `wishlistService.add(userId, productId, callerContext)` to perform the actual write.
- **`src/infrastructure/http/controller.ts`** — provides `parseBody` (Zod validation, 422 on failure), `refused` (uniform rejection check), and `catchAs` (unified error serialization).
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts IP/UA metadata for audit.
- **`src/infrastructure/http/response.ts`** — `successResponse` shapes the `200` JSON envelope.
- **`src/types/index.ts`** — supplies the `CreateWishlistItemRequest` and `WishlistResponse` type contracts.

## Notes

- **Idempotent by design.** Saving a product already on the wishlist returns the same `200` body with no side effects — a double-clicked "heart" is not an error path.
- **No `Location` header.** Despite the `POST` verb, the response is not a 201; the resource is a mutable line on an existing collection.
- **`request.authContext!`** uses a non-null assertion — the auth middleware in `routes.ts` guarantees the field is set before this controller runs.
- **`productId` domain check** is enforced by the Zod schema (`@api/schemas.zod`), not by the service layer; an out-of-domain id yields `422` before any service call.
