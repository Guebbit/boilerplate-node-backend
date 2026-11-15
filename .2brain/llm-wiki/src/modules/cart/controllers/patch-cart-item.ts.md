---
source: src/modules/cart/controllers/patch-cart-item.ts
sha256: 355c8370af8f81a660d690290960dd27d00070d11fb3feb94f5fadb418ce7c65
generated_at: 2026-11-14T19:27:35.547305+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/patch-cart-item.ts

## Purpose

Thin HTTP adapter for `PATCH /cart/items/:productId`. Extracts the product ID from the path and the quantity from the body, then delegates to `cartService.updateItemQuantity` and serialises the result (or an error) back to the client.

## Key elements

- **`patchCartItem`** (exported) — Express handler. Validates the `:productId` path param and the JSON body (quantity), calls `cartService.updateItemQuantity(userId, productId, quantity, callerContext)`, and responds with either the updated `CartResponse` or a structured error.

## Relationships

- **`src/modules/cart/routes.ts`** — registers `patchCartItem` as the handler for the `PATCH /cart/items/:productId` route.
- **`src/modules/cart/services/index.ts`** — source of `cartService`, the cart service this controller delegates to.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs`, `parseBody`, and `refused` (the shared error/validation/short-circuit helpers used by every controller in this project).
- **`src/infrastructure/http/ids.ts`** — supplies `requireId`, which validates the `:productId` path segment and short-circuits with a 404 if it is malformed or missing.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, extracted from the request and forwarded to the service for audit/permission context.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the standard success envelope wrapper.
- **`src/types/index.ts`** — provides the `CartResponse` and `UpdateCartItemByProductIdRequest` types used for the response payload and the generic body parameter.

## Notes

- **No `If-Match` / ETag concurrency control.** There is no `GET` on this URL; the cart enforces its own line-item rules instead of optimistic locking.
- **404 semantics are dual:** a product the storefront wouldn't display (unknown product) and a line the cart does not hold (`cart.item-not-found`) both surface as 404. Both originate inside the service layer (`upsertCartItem` / `updateItemQuantity`), not in this controller.
- **Malformed `productId` is deliberately mapped to the same 404** the service would return for an unknown product, rather than a 400 — the controller calls `requireId` with a `notFound` code so the client sees one consistent error.
- **Body carries only `quantity`.** The product identity is exclusively the path segment; the body schema (`UpdateCartItemByProductIdBody`) contains no product field.
