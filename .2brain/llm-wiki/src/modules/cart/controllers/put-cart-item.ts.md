---
source: src/modules/cart/controllers/put-cart-item.ts
sha256: 99255c2edfe3b1be7b5e059c066ea76b56c566baef0b810ead92121cd4cf76d9
generated_at: 2026-09-23T18:29:55.696973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/put-cart-item.ts

## Purpose

Thin HTTP adapter that handles `PUT /cart/:productId`. It validates the incoming request, extracts the product ID and desired quantity, and delegates the actual cart-mutation logic to `cartService.cartItemUpdateQuantity`. Exists to keep Express plumbing (parsing, auth, error mapping) separate from cart domain logic.

## Key elements

- **`putCartItem`** (exported const) — The sole controller handler. Accepts an Express `Request`/`Response`, reads the authenticated user ID, validates the body against `UpdateCartItemByIdBody` (zod), resolves `productId` from path param or body via `readInput`, validates it as an ObjectId, then calls `cartService.cartItemUpdateQuantity`. On success sends a `CartResponse` via `successResponse`; on refusal or error routes through `refused` / `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error-to-HTTP mapping) and `refused` (service-level rejection check) used in the promise chain.
- **`src/infrastructure/http/request.ts`** — Provides `requireObjectId`, `readInput`, and `callerContextOf` for input extraction, ID validation, and caller context propagation.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the typed success reply.
- **`src/modules/cart/routes.ts`** — Registers `putCartItem` as the handler for the `PUT /cart/:productId` route.
- **`src/modules/cart/services/index.ts`** — Source of `cartService`, whose `cartItemUpdateQuantity` method performs the actual read-modify-write on the cart.
- **`src/types/index.ts`** — Supplies the `CartResponse` and `UpdateCartItemByIdRequest` type aliases used in generics and parameter typing.

## Notes

- `productId` can arrive via the URL path **or** the request body; `readInput` resolves whichever is present. The JSDoc explicitly notes the body shape is already zod-validated at that point.
- The doc comment states this endpoint intentionally mirrors `POST /cart` in its 404 behaviour for unknown products, pointing to the shared origin in `cartItemSetById`.
- The handler is synchronous in signature (no `async`/`await`); it returns the promise chain from `cartService` directly, letting the caller (Express or a wrapper) handle it.
- `request.authContext!.id` is accessed with a non-null assertion — the route is presumed to sit behind an auth middleware that guarantees `authContext` is set.
