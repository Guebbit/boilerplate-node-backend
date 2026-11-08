---
source: src/modules/cart/controllers/post-cart-merge.ts
sha256: e22031bba359cc9cf8b6e5b2a949b12df3766fe9ec87a3b01cbe006a9d46f582
generated_at: 2026-11-08T05:12:12.078565+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-cart-merge.ts

## Purpose

Thin HTTP adapter for the `POST /cart/merge` endpoint. It validates the incoming body, delegates the actual merge logic to `cartService.merge`, and formats the response — keeping transport concerns separate from cart-domain logic.

## Key elements

- **`postCartMerge`** (exported) — Express handler for `POST /cart/merge`. Accepts a `Request<unknown, unknown, MergeCartRequest>` and a `Response`. Parses the body against the `MergeCartBody` Zod schema, calls `cartService.merge` with the authenticated caller's ID, the submitted lines, and caller context, then writes a 200 `MergeCartResponse`.
- **Body validation** — `parseBody(MergeCartBody, …)` short-circuits with a 4xx if the payload is malformed; no service call is made.
- **Error handling** — `.catch(catchAs(response, 'mergeCart'))` maps any thrown service error to a standard error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the `parseBody` and `catchAs` helpers used for validation and error shaping.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf(request)`, which extracts caller metadata passed to the service layer.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the standard 200 envelope.
- **`src/modules/cart/services/index.ts`** — provides `cartService.merge(userId, lines, callerContext)`, the actual merge implementation.
- **`src/modules/cart/routes.ts`** — registers `postCartMerge` on the `POST /cart/merge` route (and is responsible for enforcing authentication before the handler runs).
- **`src/types/index.ts`** — defines the `MergeCartRequest` and `MergeCartResponse` shapes used as generic parameters on the Express `Request` and on `successResponse`.

## Notes

- The handler assumes `request.authContext` is non-null (`request.authContext!.id`); auth enforcement is expected to happen upstream (middleware/route guard in `routes.ts`).
- By design the endpoint **always returns 200** once the body is valid: lines the cart cannot accept are reported in the response `lines` array rather than causing an HTTP error, so partially-mergeable carts still land.
- The Zod schema `MergeCartBody` lives in `@api/schemas.zod` (an external/shared package), not in this module.
