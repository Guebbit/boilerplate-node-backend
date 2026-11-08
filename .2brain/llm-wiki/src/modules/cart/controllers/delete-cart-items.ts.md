---
source: src/modules/cart/controllers/delete-cart-items.ts
sha256: c925bcec91379a22e98b9deb48b35d643f645c83b390f22a65794c7e008827ea
generated_at: 2026-11-08T05:11:27.871431+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/delete-cart-items.ts

## Purpose

Thin HTTP adapter that handles `DELETE /cart/items` — removing **all** items from the authenticated user's cart. It delegates to `cartService.remove` and exists as a dedicated, bodyless endpoint so the destructive operation is unambiguously opt-in by URL rather than hidden behind a query flag or body parameter.

## Key elements

- **`clearCart`** (exported) — Express handler for `DELETE /cart/items`. Reads `userId` from `request.authContext`, calls `cartService.remove(userId, callerContextOf(request))`, sends the resulting cart via `successResponse<CartResponse>`, and routes errors through `catchAs`.

## Relationships

- **`src/modules/cart/services/index.ts`** — source of `cartService`; its `.remove` method performs the actual cart-clearing logic.
- **`src/modules/cart/routes.ts`** — registers `clearCart` on the `DELETE /cart/items` route.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the shared error-to-HTTP-response mapper.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, which extracts caller metadata from the request for the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the standard 200 JSON reply helper.
- **`src/types/index.ts`** — source of the `CartResponse` type used to type the success payload.

## Notes

- The endpoint is deliberately **bodyless**. The module docstring references a 415 guard (upstream middleware) that rejects any request with a body, preventing a truncated or transformed body from accidentally triggering the full-delete path.
- `request.authContext!.id` uses a non-null assertion; auth population is assumed to be guaranteed by earlier middleware — a missing `authContext` will throw at runtime rather than produce a 401 here.
- The handler uses a `.then/.catch` promise chain rather than `async/await`, consistent with the surrounding controller style.
