---
source: src/modules/inventory/controllers/post-adjustment.ts
sha256: 4284c74cb539e14e4fd90e496b5f56baaa3bcbcf4346b262e9ad486d4199edeb
generated_at: 2026-10-15T10:34:11.456366+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-adjustment.ts

## Purpose

Controller for `POST /inventory/adjustments` — the audited stocktake-correction endpoint. It validates the incoming adjustment (product ID, signed delta, reason note), rejects zero-delta no-ops, and delegates to the inventory service, which records the admin, the delta, and the typed reason as a ledger row. It exists as a dedicated file because this is the module's single highest-visibility endpoint (an unexplained correction *is* how shrinkage appears externally).

## Key elements

- **`postAdjustment(request, response)`** – The sole export. Parses the body against the `AdjustStockBody` zod schema, enforces a non-zero `delta` (422 + field error if zero), then calls `inventoryService.adjust(productId, delta, note, callerContextOf(request))`. On success returns the resulting `InventoryLevel` (200); on service refusal or thrown error, delegates to `refused` / `catchAs`.

## Relationships

- **`src/modules/inventory/services/index.ts`** – Calls `inventoryService.adjust(…)` and handles the resulting data/refusal.
- **`src/infrastructure/http/controller.ts`** – Provides `parseBody`, `refused`, and `catchAs` used for request parsing, service-result inspection, and error formatting.
- **`src/infrastructure/http/request.ts`** – `callerContextOf(request)` extracts the authenticated admin's identity, passed to the service for the audit row.
- **`src/infrastructure/http/response.ts`** – `successResponse`, `rejectResponse`, and `fieldError` shape all HTTP responses.
- **`src/infrastructure/i18n/index.ts`** – `t('inventory.adjust-zero')` localises the zero-delta error message.
- **`src/infrastructure/i18n/context.ts`** – Supplies the locale context behind the `t` call.
- **`src/modules/inventory/routes.ts`** – Registers this handler for the `POST /inventory/adjustments` path.
- **`src/types/index.ts`** – `InventoryLevel` is the typed shape returned in the 200 response body.

## Notes

- The zero-delta guard lives here (not in the zod schema) because the comment states it "can't be expressed as a schema constraint." It is intentionally a 422 refusal, not a silent 200, to avoid writing a meaningless ledger row.
- The handler is **not** async; it returns the promise chain from `inventoryService.adjust` directly (or a resolved `Promise` on early rejection). Callers in the router should treat the return value as `Promise<void>`.
- `catchAs(response, 'postAdjustment')` is the single error sink — any throw from the service (DB failure, constraint violation) is funnelled through it rather than producing an unhandled rejection.
