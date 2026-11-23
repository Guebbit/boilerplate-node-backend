---
source: src/modules/products/controllers/delete-products.ts
source_sha256: 81122aef3a534d0a9c965abd8376cc4c1eb12c29868a3bae752f80274ce4df8e
context_sha256: 517a0b2b936b415faad85ea4bd4c59f0ece63db383834c01c80b8038d03e4913
generated_at: 2026-11-22T07:07:39.162186+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/controllers/delete-products.ts

## Purpose
Admin controller for deleting products in the catalogue. It is thin wiring that configures the shared `createDeleteController` factory for the `product` entity. It handles `DELETE /products/:id`, where `?hardDelete=true` deletes permanently and the default is a soft delete.

## Key elements
- `deleteProducts` (export): the controller built by `createDeleteController` with these options:
  - `entity: 'product'`
  - `remove: (id, hardDelete, request)`, which calls `productService.removeById(id, hardDelete, callerContextOf(request))`
  - `notFoundKey: 'products.not-found'`, the i18n key used when the product doesn't exist

## Relationships
- **`src/infrastructure/surfaces/create-delete-controller.ts`**: provides the factory that does the actual request handling. This file supplies only the entity name, the remove callback and the not-found key.
- **`src/modules/products/services/index.ts`**: supplies `productService`, whose `removeById` performs the deletion.
- **`src/infrastructure/http/request.ts`**: supplies `callerContextOf`, which turns the request into the caller context passed to the service.
- **`src/modules/products/routes.ts`**: the neighbor that wires this controller into the products routes.

## Notes
- Per the JSDoc, both delete paths announce `PRODUCT_DELETED`, and its `hardDelete` field says which kind occurred.
- Only the hard-delete path removes the product image. The JSDoc says this keeps a deleted product from outliving itself in a wishlist or on disk.
- `productService.removeById` owns the `ADMIN_PRODUCT_DELETED` audit emit, so this controller emits nothing itself.
