---
source: src/modules/cart/controllers/post-reorder.ts
sha256: 4f4a2b40925a3449478dde0694f70d096a99261863081300cc8ce30ed910e987
generated_at: 2026-09-23T18:29:47.642340+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-reorder.ts

## Purpose

Thin HTTP adapter for `POST /cart/reorder/:orderId`. Translates the Express request into a call to `cartService.reorderIntoCart`, then maps the result (or refusal) back to an HTTP response. Exists so the route layer stays declarative and the business logic stays in the service.

## Key elements

- **`postReorder(request, response)`** — The sole export. Reads `orderId` from `request.params`, calls `cartService.reorderIntoCart` with the caller's `authContext`, a caller context derived from the request, and the order ID. On success returns `200` with a `CartResponse`; on a domain-level refusal returns `409`; on unexpected error delegates to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — Imports `catchAs` (standard error-to-JSON handler) and `refused` (checks a service result for a "rejected" shape and writes the appropriate HTTP status, here 409).
- **`@infrastructure/http/request`** — Imports `callerContextOf` to extract the authenticated caller's identity/context from the Express request.
- **`@infrastructure/http/response`** — Imports `successResponse` to serialize a `CartResponse` payload into the HTTP reply.
- **`@modules/cart/services`** — Imports `cartService` and calls `reorderIntoCart`, which performs the actual "copy order lines into cart" logic.
- **`@types`** — Imports the `CartResponse` type used to type the success payload.
- **`@modules/cart/routes`** — Registers `postReorder` as the handler for the `POST /cart/reorder/:orderId` route.

## Notes

- The file's doc comment clarifies the naming: it lives under *cart* controllers (not *orders*) because the **write** target is the cart, even though the read target is an order.
- A `409` is returned (via `refused`) when every line in the order references a product that has left the catalogue—i.e., there is nothing to add. This avoids a misleading empty `200`.
- `request.authContext!` uses a non-null assertion; the auth middleware upstream is expected to have already rejected unauthenticated requests.
