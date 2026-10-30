---
source: src/modules/cart/controllers/get-cart.ts
sha256: 39c7c8772c2809ffd95568dde41e13c1fa9caebb57b37d40e11ddea1dbe29acf
generated_at: 2026-10-29T03:20:05.240927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/get-cart.ts

## Purpose

Thin HTTP adapter that handles `GET /cart` by delegating to `cartService.getForView` and formatting the result into a standard JSON response. It contains no business logic; its sole job is to bridge Express request/response objects to the cart service layer.

## Key elements

- **`getCart(request, response)`** — The only export. Extracts the authenticated user id (`request.authContext!.id`) and caller context, calls `cartService.getForView`, then sends the result via `successResponse<CartResponse>`. Errors are funneled through `catchAs(response, 'getCart')`.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers `getCart` as the handler for the `GET /cart` route.
- **`src/modules/cart/services/index.ts`** — Provides `cartService.getForView`, the actual cart-fetching logic this controller wraps.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard envelope used to send a successful JSON payload.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-catch helper that formats a failure response.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, used to extract caller metadata passed into the service.
- **`src/types/index.ts`** — Defines the `CartResponse` type used as the generic parameter on `successResponse`.

## Notes

- `request.authContext!` uses a non-null assertion. Authentication is enforced by upstream middleware (noted in the docstring); if a route is ever mounted without that middleware, the `!` will throw at runtime rather than fail at compile time.
- The controller is intentionally stateless and synchronous in shape (`.then`/`.catch` chain). Any validation or authorization beyond the "who is the user?" question belongs in the service layer, not here.
