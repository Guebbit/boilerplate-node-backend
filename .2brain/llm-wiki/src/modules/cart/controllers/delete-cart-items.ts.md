---
source: src/modules/cart/controllers/delete-cart-items.ts
sha256: c925bcec91379a22e98b9deb48b35d643f645c83b390f22a65794c7e008827ea
generated_at: 2026-10-29T03:19:50.829782+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/delete-cart-items.ts

## Purpose
Thin Express adapter for `DELETE /cart/items` that delegates to `cartService.remove` to wipe **all** items from a user's cart. It exists as a deliberately separate, bodyless endpoint so the destructive "clear everything" action is explicitly requested by URL name, distinguishing it from partial-item removal.

## Key elements
- **`clearCart`** (exported) — Express handler `(request, response) => void`. Reads `request.authContext!.id` for the user ID, calls `cartService.remove(userId, callerContextOf(request))`, sends the resulting `CartResponse` via `successResponse`, and funnels errors through `catchAs(response, 'clearCart')`.

## Relationships
- **`src/modules/cart/routes.ts`** — Registers `DELETE /cart/items` → `clearCart`.
- **`src/modules/cart/services/index.ts`** — Provides `cartService`, whose `.remove(userId, ctx)` performs the actual deletion and returns the updated cart.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)` to extract caller metadata passed alongside the user ID.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the standardized success envelope.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` for uniform error-to-HTTP mapping.
- **`src/types/index.ts`** — Defines `CartResponse`, the shape sent back to the client.

## Notes
- **No body is accepted.** The module docblock states a 415 guard (enforced upstream, likely in the router or middleware) rejects any `Content-Type` / body, ensuring a request that lost headers in transit cannot accidentally trigger this endpoint.
- **`request.authContext!`** — The non-null assertion assumes auth middleware has already populated the context; calling this handler without that guard would throw at runtime.
- The endpoint is semantically "nuclear" for the cart: it does not accept a list of line IDs. For selective removal, a different route/handler is expected.
