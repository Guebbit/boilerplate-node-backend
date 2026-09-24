---
source: src/modules/cart/controllers/delete-cart-item.ts
sha256: 3a887fd786a8f2430d70dcff7f442d911f4617b6b04d279c2088cb8efb5eb97f
generated_at: 2026-09-23T18:29:06.787251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/delete-cart-item.ts

## Purpose

Single exported controller that handles both `DELETE /cart/:productId` (canonical) and `DELETE /cart` (alias) by delegating to `cartService.cartItemRemoveById`. It resolves `productId` from whichever surface the route provides, validates it, and returns the updated cart or an appropriate HTTP error.

## Key elements

- **`deleteCartItem`** (exported const) — Express handler typed against both route shapes. Reads `productId` via `readInput`, validates it with `requireObjectId`, calls the service, then responds with `successResponse` (200 + i18n message) or routes the error through `refused` / `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/routes.ts` | Registers `deleteCartItem` as the handler for both the canonical and alias routes. |
| `src/modules/cart/services/index.ts` | Provides `cartService.cartItemRemoveById`, the sole business call. |
| `src/infrastructure/http/request.ts` | Supplies `readInput` (dual-surface `productId` resolution), `requireObjectId` (format validation), and `callerContextOf` (forwarding context to the service). |
| `src/infrastructure/http/response.ts` | Supplies `successResponse` for the 200 reply. |
| `src/infrastructure/http/controller.ts` | Supplies `refused` (domain-level rejection → 4xx) and `catchAs` (unexpected error → 5xx). |
| `src/infrastructure/i18n/index.ts` / `context.ts` | Provides `t()` for the success message key `cart.product-removed`. |
| `src/types/index.ts` | Declares `CartResponse` (response payload) and `RemoveCartItemRequest` (alias body shape). |

## Notes

- **One function, two routes.** The generic type marks `productId` as optional (`productId?: string`) because the alias route has no path segment. `readInput` with `surface: 'write'` resolves the value: path param wins on the canonical route; body is the only source on the alias.
- **Auth is assumed present.** `request.authContext!.id` uses a non-null assertion; the auth middleware is expected upstream of this handler.
- **No query-string input.** The comment explicitly notes neither route declares query params, so `readInput` ignores that surface.
- **Alias naming.** The alias is documented as `x-alias-of: removeCartItem` (see `docs/theory/request-input.md` referenced in the module docblock).
