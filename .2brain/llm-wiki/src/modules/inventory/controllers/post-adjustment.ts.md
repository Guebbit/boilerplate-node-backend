---
source: src/modules/inventory/controllers/post-adjustment.ts
sha256: ca70d70a6797178c74859b8d64c160d5c4c88ba992be4b60a897afc8d1db0872
generated_at: 2026-11-08T05:57:57.618001+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-adjustment.ts

## Purpose

HTTP handler for `POST /inventory/levels/:productId/adjust` — the audited stocktake-correction endpoint. It validates the request, rejects a zero delta, and delegates to the inventory service to write a ledger row recording the admin, the signed quantity change, and a human-supplied reason.

## Key elements

- **`postAdjustment`** (exported) — the sole handler. Pipeline: `requireId` → `parseBody(AdjustStockBody)` → zero-delta guard (422) → `inventoryService.adjust(productId, delta, note, callerContextOf(request))` → success (200, `InventoryLevel`) or refusal.
- **Zero-delta guard** — explicit `delta === 0` check after schema parsing, because the constraint can't be expressed in the Zod schema. Returns a 422 with a localized field error rather than writing a meaningless ledger row.

## Relationships

- **`@infrastructure/http/controller`** — supplies `catchAs`, `parseBody`, and `refused`, the shared controller utilities for error handling, schema validation, and service-refusal short-circuiting.
- **`@infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:productId` route param; on failure it writes the 404 itself and the handler returns early.
- **`@infrastructure/http/request.ts`** — `callerContextOf(request)` captures the authenticated admin identity, which is passed into the service call for the audit row.
- **`@infrastructure/http/response.ts`** — `fieldError`, `successResponse`, `rejectResponse` are the standardized response shapers used throughout.
- **`@infrastructure/i18n`** — `t('inventory.adjust-zero')` provides the localized message for the zero-delta rejection.
- **`../services` (`src/modules/inventory/services/index.ts`)** — `inventoryService.adjust` performs the actual stock-level mutation and returns either a result or a refusal.
- **`src/modules/inventory/routes.ts`** — wires `postAdjustment` onto the Express router for the `POST /inventory/levels/:productId/adjust` path.
- **`@types`** — `InventoryLevel` is the shape of the successful response body.

## Notes

- The module docstring calls this "THE audited endpoint" of the inventory module. Any change to the fields passed into `inventoryService.adjust` directly affects the audit trail (who, how much, why).
- The zero-delta check lives in the controller, not the schema or service. If you add a new non-negative constraint that can't be expressed in Zod, follow the same pattern: check in the handler, return 422.
- `callerContextOf` is the only way the handler learns *who* is making the correction; the service does not re-derive identity. Losing this call would produce an unattributed ledger row.
