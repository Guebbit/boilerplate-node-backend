---
source: src/modules/inventory/controllers/patch-inventory-level.ts
sha256: 42b4933f36ae0c529e3a9434f57a5924a9b0cf57ec2eed5d6bd6348e4e3fff0b
generated_at: 2026-11-08T05:57:47.497612+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/patch-inventory-level.ts

## Purpose

Handles `PATCH /inventory/levels/:productId`. Edits a product's backorder (preorder) limit — the only mutable field on an inventory level. Because this value represents the shop's binding promise to buyers, every write is audited via caller context.

## Key elements

- **`patchInventoryLevel(request, response)`** (exported) — The sole handler. Validates the `productId` param, parses the body against the `UpdateInventoryLevelBody` Zod schema, then either reads or writes the level and returns it with HTTP 200.
- **Merge-patch short-circuit** — If the parsed body has `backorderLimit === undefined`, the handler performs a read-only `inventoryService.getLevel(productId)` call (no write, no audit). Otherwise it calls `inventoryService.setBackorderLimit(productId, value, callerContextOf(request))`.
- **Error handling** — Delegates all failure paths to `refused(response, result)` (business-level rejections) and `catchAs(response, 'patchInventoryLevel')` (unexpected errors).

## Relationships

- **`src/modules/inventory/services/index.ts`** — Calls `inventoryService.getLevel` (read path) and `inventoryService.setBackorderLimit` (write path).
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, `parseBody`, and `refused` for body validation and uniform error responses.
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to extract and validate the `productId` route param.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to capture audit metadata for the write path.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to shape the 200 reply.
- **`src/types/index.ts`** — Imports the `InventoryLevel` type used as the success-response generic.
- **`src/modules/inventory/routes.ts`** — Expected consumer that registers this handler on the `PATCH /inventory/levels/:productId` route.

## Notes

- Despite being a PATCH handler, a request body with no fields (or an explicitly `undefined` `backorderLimit`) results in a **read**, not a write. The response still returns the current level with 200 — callers should not expect a 204 or "no-op" signal.
- Early-exit branches return `Promise.resolve()` (a resolved no-op) rather than throwing or calling `next()`, which means the Express chain simply ends.
- Audit context (`callerContextOf`) is attached **only** on the write path; the read path passes no context.
