---
source: src/modules/cart/controllers/delete-cart-item.ts
sha256: 8e17cdbdf267acd017be9d6688261876765f7899210c98b5657c49b34b9a862d
generated_at: 2026-10-14T15:07:32.749051+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/delete-cart-item.ts

## Purpose

Thin HTTP adapter that maps `DELETE /cart/:productId` (canonical) and `DELETE /cart` (alias) to `cartService.cartItemRemoveById`. It extracts the target `productId` from either the path segment or the request body, delegates to the cart service, and shapes the HTTP response (200 / 404 / 422) without business logic.

## Key elements

- **`deleteCartItem`** (exported) — The sole handler. Reads `userId` from `request.authContext`, resolves `productId` via `requireId`, calls `cartService.cartItemRemoveById(userId, productId, callerContextOf(request))`, then responds with `successResponse` (200 + `CartResponse`) or short-circuits on `refused` / `catchAs`.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers `deleteCartItem` on the two DELETE routes (canonical path-segment route and the alias route with `x-alias-of: removeCartItem`).
- **`src/modules/cart/services/index.ts`** — Provides `cartService.cartItemRemoveById`, the actual removal logic.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates `productId` from params or body (404 for malformed-on-canonical, 422 for missing-on-alias).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, forwarding request metadata into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 JSON reply.
- **`src/infrastructure/http/controller.ts`** — Provides `refused` (service-level rejection) and `catchAs` (error mapping to HTTP status).
- **`src/infrastructure/i18n/index.ts`** — Provides `t` for the localized success message (`cart.product-removed`) and the not-found / validation messages used by `requireId`.
- **`src/types/index.ts`** — Declares `CartResponse` and `RemoveCartItemRequest` used in the function signature and response payload.

## Notes

- One function serves two route shapes. The `requireId` helper disambiguates: on the canonical route a *malformed* path segment yields the same 404 copy as a missing cart line; on the alias route a missing/malformed body field yields a 422 naming `productId`.
- The service itself returns 404 when the item isn't in the cart; the controller does not add its own existence check.
- No query-string handling — neither route declares one (noted in the inline comment).
- `request.authContext!` is asserted non-null; the auth middleware is expected to have populated it before this handler runs.
