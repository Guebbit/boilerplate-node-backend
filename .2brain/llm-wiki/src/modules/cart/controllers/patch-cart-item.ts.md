---
source: src/modules/cart/controllers/patch-cart-item.ts
sha256: d489e9dbdca0c20542ef796c71f1be116b7dac1f1e5eead59712969db8fcd2cb
generated_at: 2026-10-29T03:20:15.584507+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/patch-cart-item.ts

## Purpose

Express route handler for `PATCH /cart/items/:productId`. Acts as a thin HTTP adapter that extracts the path `productId`, parses the quantity from the body, and delegates to `cartService.updateItemQuantity`. Returns the full updated cart or a 404 if the line item (or product) is not found.

## Key elements

- **`patchCartItem`** (exported handler) — Validates `productId` from the path via `requireId`, parses the body (`{ quantity }`) with the `UpdateCartItemByIdBody` Zod schema, then calls `cartService.updateItemQuantity(userId, productId, quantity, callerContext)`. Responds with `successResponse<CartResponse>` on success, or routes to `refused` / `catchAs` for domain errors and unexpected failures.

## Relationships

- **`src/modules/cart/services/index.ts`** — Imports `cartService`; calls `updateItemQuantity` as the sole business-logic invocation.
- **`src/modules/cart/routes.ts`** — Upstream consumer; registers `patchCartItem` as the handler for the `PATCH /cart/items/:productId` route.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, `parseBody`, and `refused` used for body validation, domain-error mapping, and error catching.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for extracting and validating the `productId` path segment.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to build the caller context passed to the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the JSON 200 reply.
- **`src/types/index.ts`** — Supplies the `CartResponse` and `UpdateCartItemByIdRequest` types used in the handler signature and response.

## Notes

- The 404 for a cart line that doesn't exist uses error code `cart.item-not-found`; a product the storefront would never show shares the same 404 shape as `POST /cart/items` (originating from `upsertCartItem`).
- A malformed/missing `productId` path segment is answered as `products.not-found` (404), **not** a 422 — deliberately mirroring the service's "unknown product" behavior.
- `request.authContext` is accessed with a non-null assertion (`!`), implying an auth middleware guarantees its presence before this handler runs.
- The body carries only `quantity`; `productId` always comes from the path, never the body.
