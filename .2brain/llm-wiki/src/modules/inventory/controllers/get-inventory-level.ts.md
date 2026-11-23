---
source: src/modules/inventory/controllers/get-inventory-level.ts
source_sha256: d8b2fea5f7a19c1b8137947ec27a2701e83119784cc3cbffc24b67cae5738717
context_sha256: a1bfa5a040013ca628a5999c0aa5995e554a751e6c6ac402bc322fbddd686cd2
generated_at: 2026-11-22T05:16:41.357983+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/get-inventory-level.ts

## Purpose
Express controller for `GET /inventory/levels/:productId`. It returns one product's inventory counters and availability as an `InventoryLevel`.

## Key elements
- `getInventoryLevel(request, response)`: the only export.
  - It validates the `productId` route param with `requireId`. On failure it returns `Promise.resolve()` and stops, because `requireId` has already handled the response.
  - It calls `inventoryService.getLevel(productId)`.
  - If `refused(response, result)` is true, it returns without sending a success response.
  - Otherwise it sends `successResponse<InventoryLevel>(response, result.data)`.
  - Rejections go to `catchAs(response, 'getInventoryLevel')`.

## Relationships
- `src/infrastructure/http/ids.ts`: supplies `requireId`. It is configured with `name: 'productId'` and a not-found key for a missing product.
- `src/infrastructure/http/controller.ts`: supplies `refused`, which handles service results that were refused, and `catchAs`, which handles errors.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which sends the success payload.
- `src/modules/inventory/services/index.ts`: supplies `inventoryService`, whose `getLevel` does the actual lookup.
- `src/types/index.ts`: supplies the `InventoryLevel` type (imported via the `@types` alias).
- `src/modules/inventory/routes.ts`: the route file for this module. It is presumably where this handler is mounted, but that wiring is not shown here.

## Notes
- The handler returns a Promise in every path. The early exit uses `Promise.resolve()`, so the return type is consistent.
- The file contains no business logic. It only validates the id, delegates to the service, and maps the result onto the response.
