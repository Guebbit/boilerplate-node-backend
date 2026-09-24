---
source: src/modules/inventory/controllers/post-receipt.ts
sha256: 3674a8ce0e74ee7c1bcfe5d0787ee719b427fa525fe44a8d9e7cf75fdaa05660
generated_at: 2026-09-23T18:44:01.876688+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-receipt.ts

## Purpose

Handles `POST /inventory/receipts`. Validates the incoming stock-receipt payload, delegates the state change to the inventory service, and returns the updated inventory level. This is an audited entry point: a receipt is one of only two ways units can enter the shop, and the resulting row records which admin added how many.

## Key elements

- **`postReceipt`** (exported) — Express handler for the endpoint. Parses `request.body` against the `ReceiveStockBody` Zod schema, extracts `productId`, `quantity`, and `note`, calls `inventoryService.receive()` with the caller's context, then either responds with a refusal or sends a `200` success carrying the new `InventoryLevel`.

## Relationships

- **`@infrastructure/http/controller`** — Provides the three controller helpers used here: `parseBody` (schema validation), `refused` (uniform refusal handling), and `catchAs` (error-to-response mapping).
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the authenticated admin's identity so the service can stamp the audit row.
- **`@infrastructure/http/response`** — `successResponse` formats the JSON body and status code for a successful result.
- **`../service`** — The single business-logic call: `inventoryService.receive(productId, quantity, note, callerContext)`. All domain rules live in the service, not here.
- **`@types`** — `InventoryLevel` is the type parameter on the success response, describing the shape of the updated stock record returned to the caller.
- **`src/modules/inventory/routes.ts`** — Registers `postReceipt` as the handler for the `POST /inventory/receipts` route.

## Notes

- The handler uses a `.then`/`.catch` promise chain rather than `async`/`await`; `catchAs` is the unified error sink for the whole module.
- On success the HTTP status is **200**, not 201 — the receipt is treated as a state mutation on an existing inventory record rather than a resource creation.
- The `note` field is optional in the schema but is passed through verbatim to the service; it exists purely for the audit trail.
