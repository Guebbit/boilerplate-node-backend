---
source: src/modules/inventory/controllers/post-adjustment.ts
sha256: a8c157e8b3e59bf2a055ef0aafa013549ded5f669f880d154f0c8d3978e8865a
generated_at: 2026-10-14T15:53:19.416422+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-adjustment.ts

## Purpose

Handles `POST /inventory/adjustments`, the audited stocktake-correction endpoint. Each row records the acting admin, the signed quantity delta, and a free-text reason, because an unexplained stock correction is indistinguishable from shrinkage. This file is the HTTP boundary that validates the request, blocks no-op adjustments, and delegates to the service layer.

## Key elements

- **`postAdjustment(request, response)`** — the sole export. Parses the body against the `AdjustStockBody` Zod schema, rejects a zero `delta` with a `422` and a localized message (`inventory.adjust-zero`), then calls `inventoryService.adjust(productId, delta, note, callerContext)`. On success it returns `200` with the resulting `InventoryLevel`; on service-level refusal it short-circuits via `refused()`; on thrown errors it delegates to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — imports `parseBody`, `refused`, and `catchAs` for schema validation, service-refusal short-circuiting, and unified error serialization.
- **`@infrastructure/http/request`** — imports `callerContextOf` to extract the authenticated admin identity from the request and pass it into the service call (the audit trail).
- **`@infrastructure/http/response`** — imports `successResponse` and `rejectResponse` for consistent JSON envelope output.
- **`@infrastructure/i18n`** — imports `t` for the localized "delta must not be zero" message.
- **`../services`** (`src/modules/inventory/services/index.ts`) — calls `inventoryService.adjust`, which performs the actual ledger write.
- **`src/modules/inventory/routes.ts`** — registers `postAdjustment` as the handler for the `POST /inventory/adjustments` route.
- **`@types`** — imports the `InventoryLevel` type used in the success-response generic.

## Notes

- The zero-delta check is intentional and lives **in the controller**, not the schema, because `delta: 0` is a valid number type. A `422` is returned rather than silently accepting a no-op, since that would create a meaningless ledger row.
- The function returns `Promise.resolve()` after the early-reject branches so the caller (Express) always sees a thenable, avoiding unhandled-rejection surprises.
- The doc comment explicitly positions this as the primary audit surface for the inventory module; the `note` field and `callerContext` are the two pieces that make a row forensically useful.
