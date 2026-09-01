# src/modules/cart/controllers/delete-cart-item.ts

## Purpose

Thin HTTP adapter that exposes `DELETE /cart/:productId` (canonical) and `DELETE /cart` (alias) by delegating to `cartService.cartItemRemoveById`. It normalises the two input shapes into a single `productId` string, validates it, and translates the service result into an HTTP response.

## Key elements

- **`deleteCartItem`** (exported) — The sole handler. Resolves `productId` via `readInput(request, { surface: 'write', ids: ['productId'] })`, which checks the path segment first and falls back to the body (for the alias route). Returns `422` if the value is not a valid ObjectId; otherwise calls `cartService.cartItemRemoveById` and responds with the updated cart (`200`) or a refusal/404 from the service.

## Relationships

- **`@infrastructure/http/request`** — Supplies `authContextOf` (extracts `userId`), `isValidObjectId` (validation), `readInput` (dual-surface extraction), and `callerContextOf` (pass-through metadata to the service).
- **`@infrastructure/http/response`** — `successResponse` for the 200 path, `rejectResponse` for the 422 validation failure.
- **`@infrastructure/http/controller`** — `catchAs` wraps the rejection path with a standardised error shape; `refused` inspects the service result to short-circuit on 4xx/5xx outcomes before the success branch.
- **`@infrastructure/i18n`** — `t()` resolves the `cart.product-removed` success message and `generic.error-missing-data` error message at request time.
- **`../services` (cart)** — `cartService.cartItemRemoveById(userId, productId, callerContext)` performs the actual deletion and returns the updated cart or a 404 if the item is absent.
- **`@types`** — `RemoveCartItemRequest` types the body parameter for the alias route.
- **`routes.ts` (cart)** — Wires `deleteCartItem` to both the canonical and alias route definitions (not a direct import; the controller is registered there).

## Notes

- The alias route (`DELETE /cart`) carries `x-alias-of: removeCartItem` and *requires* `productId` in the body. The canonical route takes it as a path segment. `readInput` with `surface: 'write'` resolves this by preferring the path segment and falling back to the body, so the same handler serves both without branching.
- Validation failure (non-ObjectId `productId`) returns `422`, not `400` or `404` — consistent with the "missing/invalid data" convention used elsewhere.
- The service owns the 404-when-not-in-cart behaviour; the controller does not duplicate that check.
