# src/modules/inventory/controllers/post-adjustment.ts

## Purpose

Controller handler for `POST /inventory/adjustments` — a stocktake correction. This is the module's primary audited endpoint: an unexplained stock correction is indistinguishable from shrinkage, so the handler enforces a non-zero signed delta and a human-written reason before delegating to the inventory service.

## Key elements

- **`postAdjustment(request, response)`** (exported) — the sole handler. Validates the body against the `AdjustStockBody` Zod schema, rejects `delta === 0` with a `422` and an i18n error code, then calls `inventoryService.adjust(productId, delta, note, callerContext)`. Resolves with `successResponse` or a refusal; errors are routed through `catchAs`.
- **Zero-delta guard** — explicit `422` check *after* schema parsing (not expressible as a Zod constraint). A no-op ledger row is treated as an error, not silently accepted.
- **`callerContextOf(request)`** — extracted from the request and passed to the service so the resulting ledger row records *who* made the adjustment.

## Relationships

- **`../routes.ts`** — registers `postAdjustment` as the handler for the `POST /inventory/adjustments` route.
- **`../service.ts`** — calls `inventoryService.adjust(...)`; the service owns the actual ledger write and any authorization checks.
- **`@infrastructure/http/controller`** — provides `parseBody` (Zod validation), `refused` (service-level rejection check), and `catchAs` (error → HTTP mapping).
- **`@infrastructure/http/request`** — provides `callerContextOf` to identify the acting admin.
- **`@infrastructure/http/response`** — provides `successResponse` / `rejectResponse` for uniform reply shaping.
- **`@infrastructure/i18n`** — provides `t` for the localized error message on zero-delta rejection (`inventory.adjust-zero`).

## Notes

- The zero-delta check lives in the controller, not the schema, because Zod has no clean "non-zero number" primitive here; the `422` response is intentional to distinguish "you sent a no-op" from a generic validation failure.
- The service is expected to return a refusal object (checked via `refused`) for business-rule failures (e.g., product not found, insufficient permission) rather than throwing, so the handler branches on `refused` before `catchAs` handles unexpected errors.
