---
source: src/modules/cart/controllers/post-cart-merge.ts
source_sha256: e22031bba359cc9cf8b6e5b2a949b12df3766fe9ec87a3b01cbe006a9d46f582
context_sha256: 942e814761bd6ed473adef161d4e68172a24d5e8968b273858507fad0a4ab15a
generated_at: 2026-11-22T04:31:08.152922+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/post-cart-merge.ts

## Purpose
Express controller for `POST /cart/merge`. It is a thin HTTP adapter that folds a guest cart into the authenticated caller's cart by delegating to `cartService.merge`.

## Key elements
- `postCartMerge(request, response)`: the exported handler.
  - Validates `request.body` with `parseBody(MergeCartBody, ...)`. If validation fails, it returns without doing anything further, because `parseBody` is passed `response` to handle the failure.
  - Calls `cartService.merge(request.authContext!.id, body.lines, callerContextOf(request))`.
  - On success, sends the result through `successResponse<MergeCartResponse>`.
  - On error, the chain's `.catch(catchAs(response, 'mergeCart'))` handles it.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody` (body validation) and `catchAs` (error-to-response mapping).
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which formats the success reply.
- `src/modules/cart/services/index.ts`: exports `cartService`, whose `merge` does the actual work.
- `src/types/index.ts`: provides the `MergeCartRequest` and `MergeCartResponse` types.
- `src/modules/cart/routes.ts`: the route table that registers this handler.

## Notes
- Once the body is valid, the endpoint always responds 200. A line the cart cannot take as asked is reported in the result's `lines`, not treated as a failure, so the lines that fit are still merged.
- The handler reads `request.authContext!.id` with a non-null assertion. It assumes authentication middleware has already populated `authContext`.
- The handler returns the promise chain, but returns `undefined` when body validation fails.
- The request body is validated against the `MergeCartBody` zod schema imported from `@api/schemas.zod`.
