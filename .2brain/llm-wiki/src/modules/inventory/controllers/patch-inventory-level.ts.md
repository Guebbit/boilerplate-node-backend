---
source: src/modules/inventory/controllers/patch-inventory-level.ts
sha256: 42b4933f36ae0c529e3a9434f57a5924a9b0cf57ec2eed5d6bd6348e4e3fff0b
generated_at: 2026-10-29T03:59:17.808985+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/patch-inventory-level.ts

## Purpose

Express controller handler for `PATCH /inventory/levels/:productId`. It edits a product's backorder (preorder) limit — the only mutable field on an inventory level — and records the change with caller context for auditing, since that cap is the promise the shop makes to buyers.

## Key elements

- **`patchInventoryLevel`** (exported) — The sole handler. Validates the `productId` path param, parses the body against the `UpdateInventoryLevelBody` Zod schema, then either reads the current level (no-op merge patch) or writes a new backorder limit via `inventoryService`. Returns the resulting `InventoryLevel` with HTTP 200.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, `parseBody`, and `refused` for unified error/parse handling and rejection detection.
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to validate and extract the `productId` path parameter.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to derive the acting identity for the audit trail passed to `setBackorderLimit`.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to format the 200 JSON reply.
- **`src/modules/inventory/routes.ts`** — Registers `patchInventoryLevel` on the `PATCH /inventory/levels/:productId` route.
- **`src/modules/inventory/services/index.ts`** — Imports `inventoryService`; calls `getLevel` for the no-op read and `setBackorderLimit` for the write.
- **`src/types/index.ts`** — Imports the `InventoryLevel` type used as the response payload shape.

## Notes

- **Merge-patch no-op:** If the request body names no fields (`backorderLimit === undefined`), the handler performs a read-only `getLevel` call — no write, no audit entry. This is an intentional branch, not a fallback.
- **Always 200:** Both the read path and the write path respond with `200` and the full `InventoryLevel` object; there is no 204 path in this handler.
- **Early-return pattern:** Validation failures (`requireId`, `parseBody`) short-circuit via `return Promise.resolve()` after the infrastructure layer has already sent an error response; the function never falls through to the promise chain.
