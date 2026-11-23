---
source: src/modules/inventory/controllers/post-adjustment.ts
source_sha256: 9e9038aa6a625b75d2b3d7a9dbc21819e5c1f5590df2919e8815f95f7de05ba4
context_sha256: ae4cc471b68eeeed2e804cccd2015135795a123ed45611a47d34c9e9be4735c2
generated_at: 2026-11-22T05:17:41.964921+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/post-adjustment.ts

## Purpose
Express controller for `POST /inventory/levels/:productId/adjust`, a stocktake correction. It is described as the module's audited endpoint: the resulting row records the admin, the signed delta and the typed reason, since an unexplained stock correction looks like shrinkage.

## Key elements
- `postAdjustment(request, response)`: the exported handler. It always returns a Promise, which is `Promise.resolve()` on early exits. It runs these steps:
  1. `requireId` validates `productId` from the path. If it is invalid, the handler replies with the `inventory.product-not-found` error.
  2. `parseBody(AdjustStockBody, ...)` validates the body and yields `{ delta, note }`.
  3. If `delta === 0`, it responds 422 with a `fieldError('delta', t('inventory.adjust-zero'))`.
  4. It calls `inventoryService.adjust(productId, delta, note, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it returns. Otherwise it sends `successResponse<InventoryLevel>(response, result.data, 200)`.
  6. Any thrown error goes to `catchAs(response, 'postAdjustment')`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `parseBody`, `refused` and `catchAs`, which handle validation, service-refusal and error responses.
- `src/infrastructure/http/ids.ts`: `requireId` validates the `productId` path param and sends the not-found response.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service, which is how the admin is attributed.
- `src/infrastructure/http/response.ts`: `fieldError`, `rejectResponse` and `successResponse` build the HTTP responses.
- `src/infrastructure/i18n/index.ts` and `src/infrastructure/i18n/context.ts`: `t` is imported from the i18n index and translates the zero-delta message.
- `src/modules/inventory/services/index.ts`: exports `inventoryService`, whose `adjust` method performs the stock change.
- `src/modules/inventory/routes.ts`: the route file that wires this handler to the endpoint.
- `src/types/index.ts`: supplies the `InventoryLevel` type for the success payload.

## Notes
- A zero `delta` cannot be expressed as a schema constraint, so it is checked in the controller. It is refused with 422 so that no meaningless ledger row is written.
- `delta` is signed, so positive and negative corrections both go through this one endpoint.
- Validation helpers send their own responses. The handler just returns when they yield a falsy value.
- The body schema `AdjustStockBody` is imported from `@api/schemas.zod`.
