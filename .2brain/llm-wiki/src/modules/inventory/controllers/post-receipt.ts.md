---
source: src/modules/inventory/controllers/post-receipt.ts
sha256: 2c27299f4465f072568d0e8b32c0da24de933705ab309f4e751d128770f54edf
generated_at: 2026-10-14T15:53:30.780321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-receipt.ts

## Purpose
Handles `POST /inventory/receipts` — the endpoint through which units from a supplier are added to shop inventory. It validates the incoming body, delegates to the inventory service, and returns the resulting stock level (or a refusal).

## Key elements
- **`postReceipt`** (exported) — The sole handler. Reads `productId`, `quantity`, and `note` from the parsed body, calls `inventoryService.receive(...)` with the caller's context, and responds with either a 200 success carrying an `InventoryLevel` payload or a refusal.

## Relationships
- **`src/modules/inventory/routes.ts`** — Registers `postReceipt` as the handler for the `POST /inventory/receipts` route.
- **`src/modules/inventory/services/index.ts`** — Source of `inventoryService`, whose `.receive()` method performs the actual stock-receipt logic.
- **`src/infrastructure/http/controller.ts`** — Provides the `parseBody`, `refused`, and `catchAs` helpers used for request validation, service-refusal handling, and error forwarding.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts the authenticated admin's identity from the request for the audit trail.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, used to serialize the 200 reply.
- **`src/types/index.ts`** — Source of the `InventoryLevel` type that shapes the response payload.

## Notes
- The module JSDoc flags this as one of only two ways units can enter the shop and emphasizes the audit intent (which admin added how many). The audit context is passed implicitly via `callerContextOf(request)` rather than a request-body field.
- On validation failure (`parseBody` returns `null`) or service refusal, the handler exits early without calling `.catch`; errors from the service promise are funnelled through `catchAs(response, 'postReceipt')`, which prefixes the error tag for logging.
