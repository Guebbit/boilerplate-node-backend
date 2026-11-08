---
source: src/modules/cart/controllers/get-cart.ts
sha256: 39c7c8772c2809ffd95568dde41e13c1fa9caebb57b37d40e11ddea1dbe29acf
generated_at: 2026-11-08T05:11:43.260567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/get-cart.ts

## Purpose

Thin HTTP adapter for the `GET /cart` endpoint. It extracts the authenticated user's ID and caller context from the incoming request, delegates to `cartService.getForView`, and formats the resulting cart into a standard HTTP success or error response.

## Key elements

- **`getCart`** (default export) — Express handler for `GET /cart`. Calls `cartService.getForView(userId, callerContext)` and pipes the result through `successResponse<CartResponse>` or `catchAs(response, 'getCart')` on failure.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers `getCart` as the handler for the `GET /cart` route (authentication middleware runs before this handler is reached).
- **`src/modules/cart/services/index.ts`** — Source of `cartService`; this file calls `cartService.getForView`.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, used to convert thrown errors into a standardized HTTP error response.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which derives caller metadata (e.g. client ID, session) from the Express `Request` object.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which wraps the cart payload in the project's standard success envelope.
- **`src/types/index.ts`** — Defines `CartResponse`, the shape of the data returned to the client.

## Notes

- `request.authContext!` is accessed with a non-null assertion; the file's docblock states that authentication is enforced by upstream route middleware, so the value is guaranteed to exist at call time. Removing or reordering that middleware would make the `!` unsafe.
- The function is intentionally side-effect-free beyond the HTTP response — all business logic lives in `cartService.getForView`.
