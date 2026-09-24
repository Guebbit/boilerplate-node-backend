---
source: src/modules/cart/controllers/delete-cart-all.ts
sha256: 7f429cd80e0c7c8d009970c54ffc2e1d3ee8d01737488478dc1dcab827158515
generated_at: 2026-09-23T18:28:56.586276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/delete-cart-all.ts

## Purpose

Thin HTTP adapter that handles the `DELETE /cart/all` endpoint. It delegates to `cartService.cartRemove` to remove every item from the authenticated user's cart. It lives on a dedicated URL (not `DELETE /cart`) so that a missing or stripped request body can never accidentally trigger a full cart wipe.

## Key elements

- **`clearCart(request, response)`** — Exported Express handler. Reads `userId` from `request.authContext!.id`, calls `cartService.cartRemove(userId, callerContextOf(request))`, then writes a `CartResponse` via `successResponse`. Errors are funnelled through `catchAs(response, 'clearCart')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `catchAs` helper used to serialise rejected promises into an HTTP error response.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts caller context (e.g. client IP, user-agent) from the raw Express request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which wraps a payload in the project's standard success envelope and sends it.
- **`src/modules/cart/routes.ts`** — Wires `DELETE /cart/all` to this `clearCart` handler.
- **`src/modules/cart/services/index.ts`** — Exports the `cartService` instance whose `cartRemove` method performs the actual cart-clearing business logic.
- **`src/types/index.ts`** — Exports the `CartResponse` type used as the response payload.

## Notes

- The file deliberately uses promise chains (`.then`/`.catch`) rather than `async`/`await`, consistent with the rest of the controller layer.
- `request.authContext!` uses a non-null assertion — the controller assumes an upstream auth middleware has already populated `authContext`; calling this route without that middleware would throw at runtime.
- The separate `/cart/all` path is a deliberate safety design: a `DELETE /cart` that defaulted to "clear all" when the body is absent would destroy the cart if a proxy or client stripped the body in transit. Asking for the destructive operation by explicit name avoids that failure mode.
