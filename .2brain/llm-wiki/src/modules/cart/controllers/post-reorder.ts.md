---
source: src/modules/cart/controllers/post-reorder.ts
sha256: 505b3dacb7481fe9517f5e2c86f6f0093e8f5c6578f4faeaef7074a8ff834162
generated_at: 2026-11-08T05:12:37.858944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-reorder.ts

## Purpose

Thin HTTP adapter for `POST /cart/reorder`. Validates the request body, delegates to `cartService.reorderIntoCart`, and maps the service result (or rejection) to an HTTP response. Exists so the cart service stays transport-agnostic while the Express layer handles parsing, auth context extraction, and status-code selection.

## Key elements

- **`postReorder`** (exported) — The sole export. Accepts an Express `Request<unknown, unknown, ReorderRequest>` and `Response`. Validates the body against the `ReorderBody` Zod schema, then calls `cartService.reorderIntoCart(authContext, orderId, callerContext)`. On success sends `200` with the `ReorderResponse` payload; on a service-level refusal sends `409`; on validation failure sends `422`; on unexpected errors sends `500` via `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — Imports `parseBody` (Zod body validation + 422 short-circuit), `refused` (409 mapping for service-level denials), and `catchAs` (unified 500 handler).
- **`@infrastructure/http/request`** — Imports `callerContextOf` to extract the per-request context (tenant/actor) passed alongside the auth token.
- **`@infrastructure/http/response`** — Imports `successResponse` to emit the standard 200 JSON envelope.
- **`../services`** (cart service index) — Consumes `cartService.reorderIntoCart`, the sole business-logic call.
- **`@types`** — Imports `ReorderRequest` and `ReorderResponse` type aliases used to type the Express generics and the response payload.
- **`routes.ts`** (cart module) — Expected to mount `postReorder` on the `POST /cart/reorder` path (not visible in this file, but implied by the module layout).

## Notes

- The 409-vs-200 distinction is intentional: an order where every line was `removed` or `capped` is a refusal, not a successful no-op. The controller does not decide this; the service returns a refusal marker that `refused()` translates.
- `request.authContext!` is asserted non-null — auth middleware upstream is assumed to have populated it. If that invariant is broken the controller will throw at runtime rather than return a 401.
- `callerContextOf(request)` is a separate parameter from `authContext`, meaning the service receives both an identity claim and a scoped execution context.
