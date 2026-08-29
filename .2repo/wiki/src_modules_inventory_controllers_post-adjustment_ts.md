# src/modules/inventory/controllers/post-adjustment.ts

## Purpose
Express handler for `POST /inventory/adjustments` — the audited stocktake-correction endpoint. It validates the request body, rejects zero-delta no-ops, and delegates to `inventoryService.adjust`, recording the caller, the signed quantity change, and a free-text reason in the ledger.

## Key elements
- **`postAdjustment(request, response)`** — the sole export. Parses the body against the `AdjustStockBody` Zod schema, returns **422** if `delta === 0`, then calls `inventoryService.adjust(productId, delta, note, callerContextOf(request))`. Responds **200** on success, uses `refused` to surface soft rejections, and funnels errors through `catchAs`.

## Relationships
- **`@infrastructure/http/controller`** (`catchAs`, `parseBody`, `refused`) — provides the shared guard/parse/error-capture utilities used throughout the handler.
- **`@infrastructure/http/response`** (`successResponse`, `rejectResponse`) — shapes the JSON envelope for both the 422 zero-delta rejection and the 200 success path.
- **`@infrastructure/http/request`** (`callerContextOf`) — extracts the authenticated admin/actor context forwarded to the service for the audit row.
- **`@infrastructure/i18n`** (`t`) — localises the `inventory.adjust-zero` message returned in the 422 body.
- **`../service`** (`inventoryService.adjust`) — performs the actual stock mutation and ledger write; this controller is a thin transport layer over it.
- **`../routes.ts`** — registers `postAdjustment` on the `POST /inventory/adjustments` path.

## Notes
- **Zero-delta rejection lives in the controller, not the schema.** The comment explains that Zod's `minimum`/`maximum` cannot express "any integer ≠ 0", so the 422 guard is hard-coded here. A no-op correction is refused rather than accepted to avoid writing a meaningless ledger row.
- **Audit sensitivity.** The JSDoc calls this "THE audited endpoint of this module." Every successful call writes a row containing the admin identity, the signed `delta`, and the admin-supplied `note`. Treat changes here as audit-impacting.
- **`refused` is a soft-fail path.** If the service returns a refusal (e.g. product not found, concurrent stocktake lock), `refused` writes the error response and the `.then` chain short-circuits — it is *not* thrown to `.catch`.
