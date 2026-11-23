---
source: src/modules/inventory/controllers/patch-inventory-level.ts
source_sha256: eb30f4dcfcd73b0b6f44f03dc5aa573222522b357da6f9a1f851d7143d8652b1
context_sha256: 04299a4fd8d4426c81cae349faee474aa4f84160813b82ab69640547b100c008
generated_at: 2026-11-22T05:17:28.925915+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/patch-inventory-level.ts

## Purpose
Express controller for `PATCH /inventory/levels/:productId`. It edits a product's stock level. The only editable field is the backorder (preorder) limit, which is audited because it caps what the shop can promise buyers.

## Key elements
- `patchInventoryLevel(request, response)`: the exported handler. It returns a Promise, or `Promise.resolve()` when it has already replied with an error.
  - Validates `productId` with `requireId`. If the id is invalid, the error code is `inventory.product-not-found`.
  - Parses the body with `parseBody(UpdateInventoryLevelBody, ...)`.
  - If `body.backorderLimit` is `undefined`, it reads the current level through `inventoryService`. This is a no-op merge patch, so there is no write and no audit.
  - Otherwise it calls the service to set the backorder limit, passing `callerContextOf(request)`.
  - If `refused(response, result)` is true, it stops, because the response has already been sent. Otherwise it replies 200 with `successResponse<InventoryLevel>(response, result.data, 200)`.
  - Rejections go to `catchAs(response, 'patchInventoryLevel')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`.
- `src/infrastructure/http/ids.ts`: supplies `requireId` for the `productId` param.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which provides the caller context passed to the service write.
- `src/infrastructure/http/response.ts`: supplies `successResponse`.
- `src/modules/inventory/services/index.ts`: supplies `inventoryService`, which does the actual read and write work.
- `src/types/index.ts`: supplies the `InventoryLevel` type for the response payload.
- `src/modules/inventory/routes.ts`: the route wiring for this handler, as described by the file header. The import direction is not visible in this file.

## Notes
- There is no `If-Match` precondition. The file's comment says this is because only one field is editable. Stock quantity changes go through separate receive/adjust operations, which have their own atomic rule.
- An empty patch returns the current level with status 200 and does not touch the audit trail.
