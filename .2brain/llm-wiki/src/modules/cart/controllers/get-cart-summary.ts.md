---
source: src/modules/cart/controllers/get-cart-summary.ts
sha256: d1136255500308a7152fd85f595d62c066a8b9dce4ebbd0a5128c1f076f4e630
generated_at: 2026-11-08T05:11:36.162180+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/get-cart-summary.ts

## Purpose

Thin HTTP adapter for the `GET /cart/summary` endpoint. It extracts the authenticated user's ID from the request, delegates to `cartService.getForBadge`, and sends back only the `summary` sub-field of the resulting cart object.

## Key elements

- **`getCartSummary(request, response)`** (exported) — The sole handler. Calls `cartService.getForBadge(request.authContext!.id)`, responds with `cart.summary` wrapped by `successResponse<CartSummaryResponse>`, and funnels rejections into `catchAs(response, 'getCartSummary')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-to-HTTP mapper used in the `.catch` handler.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which serialises the payload and sets the status code.
- **`src/modules/cart/routes.ts`** — The route table that wires this handler to the `/cart/summary` path.
- **`src/modules/cart/services/index.ts`** — Source of `cartService`; the `getForBadge` method contains all business logic the controller relies on.
- **`src/types/index.ts`** — Defines the `CartSummaryResponse` type used as the generic bound on the success response.

## Notes

- `request.authContext!.id` uses a non-null assertion. The handler assumes an upstream auth middleware has populated `authContext`; there is no defensive check in this file.
- The service method is named `getForBadge` while the public route is `/cart/summary` — the naming mismatch is intentional (the badge use-case returns a summary), but it's easy to misread as a different operation.
- Error handling is delegated entirely to `catchAs`; no try/catch or async/await is used here (promise chain style).
- Only `cart.summary` is sent to the client, not the full cart object.
