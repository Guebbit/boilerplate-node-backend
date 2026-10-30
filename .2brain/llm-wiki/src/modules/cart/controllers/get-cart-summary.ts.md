---
source: src/modules/cart/controllers/get-cart-summary.ts
sha256: d1136255500308a7152fd85f595d62c066a8b9dce4ebbd0a5128c1f076f4e630
generated_at: 2026-10-29T03:19:57.396098+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/get-cart-summary.ts

## Purpose

HTTP adapter for the `GET /cart/summary` endpoint. It extracts the authenticated user's ID from the request, delegates to `cartService.getForBadge`, and writes the resulting cart summary into the response. It exists to keep routing, service logic, and response shaping in separate layers.

## Key elements

- **`getCartSummary(request, response)`** — The sole export. A thin async handler that:
  1. Calls `cartService.getForBadge(request.authContext!.id)`.
  2. On success, sends the `cart.summary` field as a `CartSummaryResponse` via `successResponse`.
  3. On failure, forwards the error to `catchAs(response, 'getCartSummary')` for standardized error formatting.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers `getCartSummary` on the `GET /cart/summary` route.
- **`src/modules/cart/services/index.ts`** — Provides `cartService.getForBadge`, the business-logic call this controller delegates to.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, used to serialize the summary into the HTTP response.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-catch utility that formats failure responses.
- **`src/types/index.ts`** — Defines the `CartSummaryResponse` type that shapes the payload.

## Notes

- The handler is intentionally thin: it only extracts `request.authContext!.id` and maps the service result to a response. All domain logic lives in `cartService.getForBadge`.
- `request.authContext` is accessed with a non-null assertion (`!`), implying an upstream middleware guarantees it is present before this route is reached.
- Only the `summary` field of the service result is forwarded; the full cart object is not exposed to the client.
