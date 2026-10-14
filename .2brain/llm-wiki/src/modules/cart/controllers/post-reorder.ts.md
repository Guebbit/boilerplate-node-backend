---
source: src/modules/cart/controllers/post-reorder.ts
sha256: d2a1f6196fa6cc11f3a4db4f703a1a90aa50a6b08e2e285e1c33f5ab61cb9308
generated_at: 2026-10-14T15:08:37.109183+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-reorder.ts

## Purpose

HTTP adapter for `POST /cart/reorder/:orderId`. Validates the `orderId` path param, delegates to `cartService.reorderIntoCart`, and maps the result (or refusal) onto an Express response. It exists to keep route handling and business logic in separate layers.

## Key elements

- **`postReorder`** (exported) — The sole handler. Extracts and validates `orderId` via `requireId`, then calls `cartService.reorderIntoCart(authContext, orderId, callerContext)`. On success it sends `200` with a `CartResponse` body; on refusal it sends `409`; on thrown errors it delegates to `catchAs`.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers `postReorder` on the `POST /cart/reorder/:orderId` route.
- **`src/modules/cart/services/index.ts`** — Source of `cartService.reorderIntoCart`, the business-logic call this controller wraps.
- **`src/infrastructure/http/controller.ts`** — Provides the `catchAs` and `refused` helpers used for error/refusal response mapping.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which validates the `orderId` param and short-circuits with a 404 if missing/invalid.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to derive the caller context passed into the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 reply.
- **`src/types/index.ts`** — Defines the `CartResponse` type used to type the success payload.

## Notes

- The JSDoc states that lines whose product has left the catalogue are silently skipped, and an order with *nothing* left to add returns `409` (handled upstream in the service; the controller just surfaces the refusal via `refused`).
- The function is a plain arrow, not a class method or async — promise chaining is used rather than `async/await`.
- `request.authContext!` is asserted non-null; the route presumably guarantees auth middleware runs first.
