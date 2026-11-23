---
source: src/modules/products/controllers/get-product.ts
source_sha256: 07612030d667b20b75b35d43e547fa541d6ef733fcce5c2ad08ba5026e27488a
context_sha256: 9085fd37798e23cbf7e26e54cbdd4a6bd9a64ec0b1ffc73f573188bc883b0a11
generated_at: 2026-11-22T07:07:49.019235+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/controllers/get-product.ts

## Purpose
Controller for `GET /products/:id`. It is a thin wiring of the shared `createItemController` factory to the product service. Visibility is scoped to the caller, so only callers whose scope allows it can see non-active or deleted products.

## Key elements
- `getProductItem`: exported controller built with `createItemController`. Its config is:
  - `entity: 'product'`
  - `notFoundKey: 'products.not-found'`, the key used for the not-found response
  - `fetch(id, request)`, which calls `productService.getByIdForCaller(id, productService.callerScope(request.caller), callerContextOf(request))`

## Relationships
- `src/infrastructure/surfaces/create-item-controller.ts`: provides the `createItemController` factory that this file configures.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which builds the caller context from the request.
- `src/modules/products/services/index.ts`: provides `productService`. This file uses its `getByIdForCaller` and `callerScope` methods.
- `src/modules/products/routes.ts`: a graph neighbor, so it presumably mounts `getProductItem` on the route. The route registration is not visible in this file.

## Notes
- `request.caller` is resolved from a session or an API key by `getAuth`, according to the inline comment. `getAuth` is not part of this file.
- The file contains no business logic. Visibility rules live in the product service's `callerScope` and `getByIdForCaller`.
