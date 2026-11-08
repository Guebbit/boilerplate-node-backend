---
source: src/modules/cart/controllers/delete-cart-item.ts
sha256: 7b4a52b0158beb77d8e551981ad2680b245946595bf6b40e3b1e00b44965f649
generated_at: 2026-11-08T05:11:18.870220+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/delete-cart-item.ts

## Purpose

Thin HTTP adapter that handles `DELETE /cart/items/:productId`. It extracts and validates the product ID from the URL, delegates the actual removal to `cartService.removeItemById`, and shapes the HTTP response (success or error). Exists so the service layer stays transport-agnostic.

## Key elements

- **`deleteCartItem(request, response)`** (named export) — the sole handler. Reads `userId` from `request.authContext`, validates `productId` via `requireId`, calls `cartService.removeItemById(userId, productId, callerContextOf(request))`, then responds with the updated `CartResponse` (200) or an error.

## Relationships

- **`src/modules/cart/routes.ts`** — registers `deleteCartItem` as the handler for the `DELETE /cart/items/:productId` route.
- **`src/modules/cart/services/index.ts`** — provides `cartService.removeItemById`, the business-logic call this controller delegates to.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `productId` path segment; on failure it writes a 404 and short-circuits the handler.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts caller metadata from the request to pass into the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` serializes the `CartResponse` payload.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects a rejected service result and writes the appropriate error status; `catchAs` wraps unexpected exceptions into a uniform error response.
- **`src/types/index.ts`** — supplies the `CartResponse` type for the success payload.

## Notes

- A malformed or missing `productId` path segment produces the **same** 404 body (`cart.item-not-found`) as a product that simply isn't in the cart. This is intentional to avoid leaking whether a given product ID exists in the catalog.
- `request.authContext!` uses a non-null assertion — the route is expected to sit behind an auth middleware that populates it; there is no fallback if it is absent.
- The function returns a Promise chain (`.then/.catch`) rather than using `async/await`; this matches the project's controller convention (see `catchAs`).
