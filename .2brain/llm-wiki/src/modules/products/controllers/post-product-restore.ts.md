---
source: src/modules/products/controllers/post-product-restore.ts
source_sha256: 5bf83cce2f843b52ec78ba7fd979cc0292ef685a3bcc7f0b869e5e91a963b456
context_sha256: 47f6d3f6e5591cd81f69611d6c659bc35fc1a3820a2a3dd6133ea926f673648a
generated_at: 2026-11-22T07:08:08.624582+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/controllers/post-product-restore.ts

## Purpose
Admin controller for `POST /products/:id/restore`, which undoes a soft delete of a product. It contains no logic of its own: it wires the product service into the shared `createRestoreController` factory.

## Key elements
- `restoreProducts`: the exported controller, built with `createRestoreController`. Its configuration:
  - `entity: 'product'`
  - `basePath: '/products'`
  - `notFoundKey: 'products.not-found'`
  - `restore(id, request)`: calls `productService.restoreById(id, callerContextOf(request))`.
  - `present(product, request)`: calls `productService.presentForCaller(product, request.caller)` to shape the response for the caller.

## Relationships
- `src/infrastructure/surfaces/create-restore-controller.ts`: provides the factory. It takes the `restore` and `present` callbacks and the config values above.
- `src/modules/products/services/index.ts`: exports `productService`, which supplies `restoreById` and `presentForCaller`.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which turns the request into the caller context passed to `restoreById`.
- `src/modules/products/routes.ts`: the route table for the products module. It is the likely consumer of `restoreProducts`, though this file does not show that.

## Notes
- The file's doc comment says the endpoint returns 409 when the product is not deleted. That behaviour is not implemented in this file.
- Per the doc comment, `productService.restoreById` owns emitting the `ADMIN_PRODUCT_RESTORED` audit event, so the controller does not.
- The doc comment marks the endpoint as admin-only. No authorization check appears in this file, so access control must be applied elsewhere.
