---
source: src/modules/inventory/controllers/post-receipt.ts
sha256: 03dba5251faa89fe9a6c830533c1cfc05f566c3bb2a6f4939b0033b2bb8414f8
generated_at: 2026-11-08T05:58:08.133516+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-receipt.ts

## Purpose

Controller for `POST /inventory/levels/:productId/receive`. Handles incoming stock from a supplier — one of only two audited pathways for units to enter the shop. Validates the request, delegates to the inventory service, and shapes the HTTP response.

## Key elements

- **`postReceipt`** (exported const) — The sole handler. Accepts Express `Request<{ productId?: string }>` and `Response`. Pipeline:
  1. Extracts and validates `productId` from route params via `requireId`.
  2. Parses the request body against the `ReceiveStockBody` Zod schema via `parseBody`.
  3. Calls `inventoryService.receive(productId, quantity, note, callerContext)`.
  4. On success, sends `200` with an `InventoryLevel` payload; on service-level refusal or error, short-circuits via `refused` / `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports the `catchAs`, `parseBody`, and `refused` helpers that standardise error handling and body validation across all controllers.
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to safely read `productId` from the route and emit a 404 if absent.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to capture *who* performed the receipt (admin identity for the audit trail).
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialise the `InventoryLevel` into the JSON body.
- **`src/modules/inventory/routes.ts`** — Registers `postReceipt` as the handler for the `POST /inventory/levels/:productId/receive` route.
- **`src/modules/inventory/services/index.ts`** — Source of the `inventoryService` singleton; this file calls its `.receive()` method and consumes the resulting `{ data }` / refused shape.
- **`src/types/index.ts`** — Provides the `InventoryLevel` type used as the response generic.

## Notes

- The handler is declared as a **synchronous** function (no `async`) but returns a `Promise` from the service chain. Validation failures bail early with `Promise.resolve()` rather than throwing, keeping the Express callback contract intact.
- `callerContextOf(request)` is the audit hook: the service stores which admin added how many units, but the *extraction* of that identity lives here, not in the service.
- `ReceiveStockBody` (from `@api/schemas.zod`) defines the accepted shape (`quantity`, `note`); this file destructures only those two fields.
