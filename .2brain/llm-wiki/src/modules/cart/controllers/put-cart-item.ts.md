---
source: src/modules/cart/controllers/put-cart-item.ts
sha256: a7c91b8f123db091b2786d3bf937b5e5d1679e73ffe071c43bb236ac31f971df
generated_at: 2026-10-14T15:08:51.450096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/put-cart-item.ts

## Purpose

Thin HTTP adapter for `PUT /cart/:productId`. It extracts the product ID from the path, parses the quantity from the body, delegates to `cartService.cartItemUpdateQuantity`, and maps the service result to a `201` (line created) or `200` (line updated) response.

## Key elements

- **`putCartItem`** (exported) — Express handler. Reads `request.authContext.id` for the user, resolves `productId` via `requireId`, validates the body against `UpdateCartItemByIdBody` (Zod), calls `cartService.cartItemUpdateQuantity`, and emits the response through `createdOrOk` / `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs`, the shared guard/error utilities used in the handler.
- **`src/infrastructure/http/ids.ts`** — supplies `requireId`, which short-circuits with `404 products.not-found` if the path param is missing or malformed.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, forwarded to the service for audit/logging.
- **`src/infrastructure/http/response.ts`** — supplies `createdOrOk`, which picks `201` vs `200` based on the service's `result.status`.
- **`src/modules/cart/routes.ts`** — registers `putCartItem` as the handler for the `PUT /cart/:productId` route.
- **`src/modules/cart/services/index.ts`** — provides the `cartService` instance whose `cartItemUpdateQuantity` method performs the actual upsert.
- **`src/types/index.ts`** — defines `CartResponse` (the shape sent back) and `UpdateCartItemByIdRequest` (the typed body contract).

## Notes

- A malformed or missing `productId` is deliberately answered as **404** (not 400) so the client sees the same "product doesn't exist" signal the service would produce; this mirrors `POST /cart` behavior.
- The response status (`201` vs `200`) is determined entirely by `result.status` from the service layer, not re-deriving logic in the controller.
- `request.authContext` is accessed with a non-null assertion (`!`); the handler assumes an auth middleware has already populated it.
