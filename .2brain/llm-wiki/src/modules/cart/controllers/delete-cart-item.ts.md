---
source: src/modules/cart/controllers/delete-cart-item.ts
sha256: 7b4a52b0158beb77d8e551981ad2680b245946595bf6b40e3b1e00b44965f649
generated_at: 2026-10-29T03:19:42.967398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/delete-cart-item.ts

## Purpose

Thin Express adapter for the `DELETE /cart/items/:productId` endpoint. Extracts the product ID from the path, delegates to `cartService.removeItemById`, and shapes the HTTP response (success or error) without containing business logic.

## Key elements

- **`deleteCartItem`** (exported) — Express handler. Pulls `userId` from `request.authContext`, validates the `:productId` path segment via `requireId`, calls `cartService.removeItemById(userId, productId, callerContextOf(request))`, then either sends the updated `CartResponse` with 200 or propagates a refusal/error through `refused` / `catchAs`.

## Relationships

- **`src/modules/cart/routes.ts`** — registers `deleteCartItem` as the handler for the `DELETE /cart/items/:productId` route.
- **`src/modules/cart/services/index.ts`** — provides `cartService.removeItemById`, the sole business operation invoked here.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the `productId` path segment; short-circuits with a 404 response if malformed.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` builds the caller context passed into the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` emits the 200 JSON body.
- **`src/infrastructure/http/controller.ts`** — `refused` and `catchAs` handle service-level rejections and unexpected errors respectively.
- **`src/types/index.ts`** — supplies the `CartResponse` type used to type the success payload.

## Notes

- A malformed `:productId` path segment is intentionally indistinguishable from "item not in cart" — both yield the same 404 copy (`cart.item-not-found`). This avoids leaking which product IDs exist.
- `request.authContext!.id` uses a non-null assertion; the cart router is expected to run an auth guard upstream.
- The service is contractually responsible for returning a "refused" result (e.g. 404) when the item is absent; the controller does not check existence independently.
