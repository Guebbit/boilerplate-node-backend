---
source: src/modules/inventory/controllers/post-receipt.ts
sha256: 03dba5251faa89fe9a6c830533c1cfc05f566c3bb2a6f4939b0033b2bb8414f8
generated_at: 2026-10-29T03:59:39.541348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-receipt.ts

## Purpose

Handles `POST /inventory/levels/:productId/receive`, the endpoint for recording stock received from a supplier. It validates the product ID and request body, delegates to the inventory service, and returns the updated `InventoryLevel`. The receipt is audited: it records which admin added how many units.

## Key elements

- **`postReceipt`** (exported) — The request handler. Validates `productId` from route params, parses the body against `ReceiveStockBody`, calls `inventoryService.receive(productId, quantity, note, callerContextOf(request))`, and responds with `200` + `InventoryLevel` or a refusal/error.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the `parseBody`, `refused`, and `catchAs` helpers used for validation short-circuits, service-result handling, and error catching.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, which extracts and validates the `productId` route parameter.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, used to attach the authenticated admin's context for audit.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard 200 JSON reply helper.
- **`src/modules/inventory/services/index.ts`** — Exports `inventoryService`; this controller calls `inventoryService.receive(…)`.
- **`src/modules/inventory/routes.ts`** — Registers `postReceipt` on the `POST /inventory/levels/:productId/receive` route.
- **`src/types/index.ts`** — Provides the `InventoryLevel` type used as the response payload.

## Notes

- The route param is typed `productId?: string` (optional); `requireId` is responsible for rejecting missing/invalid values before the service is called.
- On validation failure the handler returns `Promise.resolve()` rather than throwing — the infrastructure helpers have already sent the error response.
- Success returns HTTP **200**, not 201, indicating a state change on an existing resource rather than creation.
- The body schema (`ReceiveStockBody`) comes from `@api/schemas.zod`, not from this module.
