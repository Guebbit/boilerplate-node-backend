---
source: src/modules/inventory/controllers/post-adjustment.ts
sha256: ca70d70a6797178c74859b8d64c160d5c4c88ba992be4b60a897afc8d1db0872
generated_at: 2026-10-29T03:59:30.179899+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-adjustment.ts

## Purpose

Handles `POST /inventory/levels/:productId/adjust` — the audited stocktake-correction endpoint. It validates the request (product exists, body schema, non-zero delta) and delegates to the inventory service, which records the admin, signed delta, and operator-supplied reason. The file exists to keep this single, high-consequence mutation behind one thin controller with explicit refusal paths.

## Key elements

- **`postAdjustment(request, response)`** — exported Express handler. Resolves the `productId` path param, parses the body against `AdjustStockBody`, rejects a zero `delta` with 422, then calls `inventoryService.adjust(productId, delta, note, callerContext)` and returns the resulting `InventoryLevel`.

## Relationships

- **`src/modules/inventory/services/index.ts`** — the sole business-logic caller; `inventoryService.adjust` performs the actual stock correction and audit write.
- **`src/infrastructure/http/controller.ts`** — supplies the `catchAs`, `parseBody`, and `refused` helpers used for error handling and service-result unwrapping.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `productId` path parameter and short-circuits with a 404 i18n message on miss.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts the authenticated admin's identity, which is forwarded to the service for the audit row.
- **`src/infrastructure/http/response.ts`** — `fieldError`, `successResponse`, and `rejectResponse` shape every HTTP reply in this handler.
- **`src/infrastructure/i18n/index.ts`** — `t()` provides the localized error string for the zero-delta rejection (`inventory.adjust-zero`).
- **`src/types/index.ts`** — defines the `InventoryLevel` type used as the response payload.
- **`src/modules/inventory/routes.ts`** — registers `postAdjustment` on the `POST /inventory/levels/:productId/adjust` route.

## Notes

- Zero `delta` cannot be expressed as a Zod schema constraint, so it is rejected imperatively with a 422 `fieldError`. The comment explains that a no-op would write a meaningless ledger row.
- The module docblock labels this "THE audited endpoint of this module" — the `callerContext` (admin identity) is passed explicitly to the service for the audit record; it is not implicit.
- Early-return pattern: failed validation paths return `Promise.resolve()` rather than throwing, consistent with the `@infrastructure/http/controller` helpers.
- The handler is a plain function (not a class method); it is wired directly into the route table.
