---
source: src/modules/cart/controllers/patch-cart-item.ts
sha256: 2707b51d4a498241cfa27282a63d9a59330938e786c4a8778cfe7ef317bad4fe
generated_at: 2026-11-08T05:11:52.679602+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/patch-cart-item.ts

## Purpose

Thin HTTP adapter that handles `PATCH /cart/items/:productId`, delegating to `cartService.updateItemQuantity` to change the quantity of an existing cart line and returning the updated cart. It exists to separate Express plumbing (auth, path-param validation, body parsing, response shaping) from the cart domain logic.

## Key elements

- **`patchCartItem`** (exported) — The sole controller. Reads `userId` from `request.authContext`, validates the `productId` path segment via `requireId`, parses the body against `UpdateCartItemByProductIdBody` (quantity only), calls `cartService.updateItemQuantity`, and responds with the `CartResponse` payload or an error.

## Relationships

- **`@infrastructure/http/controller`** — Supplies the `parseBody`, `refused`, and `catchAs` helpers used for body validation, service-result rejection, and error serialisation.
- **`@infrastructure/http/ids`** — Provides `requireId`, which validates the `productId` path segment and short-circuits with a 404 `products.not-found` when missing or malformed.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts caller metadata passed to the service.
- **`@infrastructure/http/response`** — `successResponse` shapes the 200 payload.
- **`@modules/cart/services`** — `cartService.updateItemQuantity(userId, productId, quantity, ctx)` performs the actual quantity update; this controller is its HTTP boundary.
- **`@types`** — `CartResponse` and `UpdateCartItemByProductIdRequest` are the shared type contracts for the response body and the typed request.
- **`@modules/cart/routes`** — Registers this handler on the `PATCH /cart/items/:productId` route.

## Notes

- **Two distinct 404s, one shared origin.** A malformed or absent `productId` path segment yields `products.not-found`; a valid product the cart doesn't hold yields `cart.item-not-found`. Both 404 responses for the "unknown product" case are produced inside the service (`upsertCartItem`), shared with `POST /cart/items`.
- **Auth is assumed present.** `request.authContext!.id` uses a non-null assertion; the controller relies on an upstream middleware having attached the auth context.
- **Body carries only `quantity`.** `productId` is a path parameter, never in the body. The Zod schema enforces this.
- **No creation side-effect.** A change never adds a new line; it only mutates an existing one.
