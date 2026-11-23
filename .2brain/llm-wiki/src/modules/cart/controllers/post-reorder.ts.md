---
source: src/modules/cart/controllers/post-reorder.ts
source_sha256: 505b3dacb7481fe9517f5e2c86f6f0093e8f5c6578f4faeaef7074a8ff834162
context_sha256: 942e814761bd6ed473adef161d4e68172a24d5e8968b273858507fad0a4ab15a
generated_at: 2026-11-22T04:31:33.698349+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/post-reorder.ts

## Purpose
Express controller for `POST /cart/reorder`. It is a thin HTTP adapter over `cartService.reorderIntoCart`. It copies one of the caller's own orders back into their cart. The order is only read, and the cart is what gets written, which is why the handler lives in the cart module.

## Key elements
- `postReorder(request, response)` is the only export. It is an Express handler typed as `Request<unknown, unknown, ReorderRequest>`.
  1. It validates `request.body` with `parseBody(ReorderBody, ...)` and returns early if validation fails.
  2. It calls `cartService.reorderIntoCart(request.authContext!, body.orderId, callerContextOf(request))`.
  3. If `refused(response, result)` handles the result, it returns early.
  4. Otherwise it sends `successResponse<ReorderResponse>(response, result.data, 200)`.
  5. Rejections go to `catchAs(response, 'postReorder')`.

## Relationships
- `@infrastructure/http/controller` (`src/infrastructure/http/controller.ts`) provides `parseBody`, `refused` and `catchAs`, which handle body validation, service refusals and error mapping.
- `@infrastructure/http/request` (`src/infrastructure/http/request.ts`) provides `callerContextOf`, which builds the caller context passed to the service.
- `@infrastructure/http/response` (`src/infrastructure/http/response.ts`) provides `successResponse`, which sends the 200 payload.
- `../services` (`src/modules/cart/services/index.ts`) provides `cartService`. Its `reorderIntoCart` holds the actual logic.
- `@types` (`src/types/index.ts`) provides the `ReorderRequest` and `ReorderResponse` types.
- `src/modules/cart/routes.ts` is a neighbor in the dependency graph. The file does not itself reference the route registration, but the `POST /cart/reorder` route presumably wires this handler.

## Notes
- A malformed `orderId` returns a 422 on the `orderId` body field, not a 404.
- Each line of the result reports what happened to it, as in the cart merge. A product no longer in the catalogue is `removed`, and one at its quantity cap is `capped`.
- If the order has nothing left to add, the response is a 409 rather than an empty 200. The comment attributes this to the service result, and the controller only forwards it via `refused`.
- `request.authContext!` uses a non-null assertion. It assumes authentication middleware has already populated it.
