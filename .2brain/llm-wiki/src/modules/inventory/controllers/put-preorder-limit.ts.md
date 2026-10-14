---
source: src/modules/inventory/controllers/put-preorder-limit.ts
sha256: 265c9f41905ab4c4849eda40833ef676af1ccefc89710874cd63003a22fc8a2c
generated_at: 2026-10-14T15:54:02.069423+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/put-preorder-limit.ts

## Purpose

HTTP handler for `PUT /inventory/levels/:productId/preorder-limit`. Validates the product ID and request body, then delegates to the inventory service to set (or update) the maximum number of units a buyer may preorder for a given product. The operation is treated as auditable because it defines the contractual cap shown to customers.

## Key elements

- **`putPreorderLimit(request, response)`** — The sole export. A request-handler that:
  1. Extracts and validates `productId` from route params via `requireId`.
  2. Parses the JSON body against the `SetPreorderLimitBody` Zod schema via `parseBody`.
  3. Calls `inventoryService.setPreorderLimit(productId, body.preorderLimit, callerContextOf(request))`.
  4. Responds with `successResponse<InventoryLevel>` (HTTP 200) on success, or a refusal on service-level rejection. Errors are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the shared helper functions `catchAs`, `parseBody`, and `refused` used for error handling and body validation.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which reads and validates the `productId` route parameter.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which derives caller identity/context from the request for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for shaping the JSON success reply.
- **`src/modules/inventory/routes.ts`** — Registers this handler on the `PUT /inventory/levels/:productId/preorder-limit` route.
- **`src/modules/inventory/services/index.ts`** — Exports `inventoryService`, whose `setPreorderLimit` method performs the actual domain work.
- **`src/types/index.ts`** — Source of the `InventoryLevel` type used as the response payload.

## Notes

- Validation failures (missing `productId` or bad body) short-circuit with an early `return Promise.resolve()` after the infrastructure helper has already sent an error response; the function then ends without touching the service.
- The service call returns a discriminated-union result: `refused(response, result)` handles the rejection branch, while the success branch reads `result.data` and `result.message`.
- The module JSDoc flags the endpoint as **audited**; the caller context passed to the service is what enables that audit trail.
