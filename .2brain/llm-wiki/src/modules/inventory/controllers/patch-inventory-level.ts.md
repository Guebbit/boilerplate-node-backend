---
source: src/modules/inventory/controllers/patch-inventory-level.ts
sha256: eb30f4dcfcd73b0b6f44f03dc5aa573222522b357da6f9a1f851d7143d8652b1
generated_at: 2026-11-14T20:03:11.882109+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/patch-inventory-level.ts

## Purpose

Controller for `PATCH /inventory/levels/:productId`. Updates the single editable field on a product's inventory level — the backorder (preorder) limit. The mutation is audited because this value is the cap the shop's purchase promise is made under.

## Key elements

- **`patchInventoryLevel`** (exported) — Express route handler. Validates `productId` via `requireId`, parses the request body against the `UpdateInventoryLevelBody` Zod schema, then either reads the current level (no-op) or writes a new backorder limit via `inventoryService.setBackorderLimit`.
- **No-op short-circuit** — If the parsed body has `backorderLimit === undefined`, the handler calls `inventoryService.getLevel(productId)` instead of writing, returns the current level with 200, and performs no audit.
- **Audited write path** — When `backorderLimit` is present, `callerContextOf(request)` is passed to the service so the mutation is recorded with attribution.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides the `catchAs`, `parseBody`, and `refused` helpers used for error handling and body validation.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` to extract and validate the `productId` route param.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to derive the audit context from the incoming request.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` to emit the JSON 200 payload.
- **`src/modules/inventory/routes.ts`** — wires this handler onto the `PATCH /inventory/levels/:productId` route.
- **`src/modules/inventory/services/index.ts`** — source of `inventoryService`, whose `getLevel` and `setBackorderLimit` methods are the two service calls this controller makes.
- **`src/types/index.ts`** — defines the `InventoryLevel` type used as the response payload.

## Notes

- **No `If-Match` / ETag**: the handler deliberately omits optimistic concurrency. The file's doc comment explains that stock quantity changes flow through separate `receive`/`adjust` endpoints with their own atomic rules; this endpoint only touches the single backorder-limit field.
- **Merge-patch semantics**: an empty or field-less body is treated as a read, not a write. This avoids spurious audit entries for clients that send `{}`.
- The Zod schema (`UpdateInventoryLevelBody`) is imported from `@api/schemas.zod` (not listed in the graph neighbors) and is the single source of truth for what fields the client may submit.
