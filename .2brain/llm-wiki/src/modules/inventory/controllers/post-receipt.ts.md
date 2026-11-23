---
source: src/modules/inventory/controllers/post-receipt.ts
source_sha256: 03dba5251faa89fe9a6c830533c1cfc05f566c3bb2a6f4939b0033b2bb8414f8
context_sha256: 04299a4fd8d4426c81cae349faee474aa4f84160813b82ab69640547b100c008
generated_at: 2026-11-22T05:17:52.574543+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/post-receipt.ts

## Purpose
Express controller for `POST /inventory/levels/:productId/receive`. It records units arriving from a supplier. The header notes this is audited: a receipt is one of only two ways units can enter the shop, and the row records which admin added how many.

## Key elements
- `postReceipt(request, response)` is the only export. It returns a Promise and runs these steps:
  1. Reads `productId` from the route with `requireId`. If the id is invalid, it uses the not-found key `inventory.product-not-found`.
  2. Validates `request.body` against the `ReceiveStockBody` Zod schema with `parseBody`, then destructures `quantity` and `note`.
  3. Calls `inventoryService.receive(productId, quantity, note, callerContextOf(request))`.
  4. Sends `successResponse<InventoryLevel>` with status 200 and the returned data.
  5. Passes any thrown error to `catchAs(response, 'postReceipt')`.

## Relationships
- `src/infrastructure/http/ids.ts` supplies `requireId`.
- `src/infrastructure/http/controller.ts` supplies `parseBody`, `refused` and `catchAs`.
- `src/infrastructure/http/request.ts` supplies `callerContextOf`, which gives the service the caller identity.
- `src/infrastructure/http/response.ts` supplies `successResponse`.
- `src/modules/inventory/services/index.ts` supplies `inventoryService`, whose `receive` method does the actual work.
- `src/types/index.ts` supplies the `InventoryLevel` type used for the response payload.
- `src/modules/inventory/routes.ts` is the router that wires this handler to the endpoint.

## Notes
- `ReceiveStockBody` comes from `@api/schemas.zod`, outside the neighbor list above.
- If `requireId` or `parseBody` fails, the function returns `Promise.resolve()` without calling the service. Those helpers appear to write the error response themselves.
- The service returns a result object, not a bare value. `refused(response, result)` is checked first, and a truthy result stops the handler before `successResponse`. The success path uses `result.data`.
- The handler contains no try/catch. It relies on the `.catch(catchAs(...))` chain.
