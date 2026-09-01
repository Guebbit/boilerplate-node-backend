# src/modules/inventory/controllers/post-receipt.ts

## Purpose

HTTP controller for `POST /inventory/receipts`. Validates the inbound request body, delegates to the inventory service to record a stock receipt, and shapes the HTTP response. Exists as a thin layer between Express routing and domain logic so the service stays transport-agnostic.

## Key elements

- **`postReceipt` (exported)** – Express handler that:
  1. Parses and validates `request.body` against the `ReceiveStockBody` Zod schema (via `parseBody`).
  2. Calls `inventoryService.receive(productId, quantity, note, callerContextOf(request))`.
  3. Sends `200` on success, or a refusal/error response via `refused` / `catchAs`.

## Relationships

- **`src/modules/inventory/service.ts`** – calls `inventoryService.receive(...)`; the service performs the actual stock mutation.
- **`src/modules/inventory/routes.ts`** – registers `postReceipt` as the handler for the `POST /inventory/receipts` route.
- **`src/infrastructure/http/controller.ts`** – supplies the shared helpers `parseBody`, `refused`, and `catchAs` used for validation, error mapping, and exception handling.
- **`src/infrastructure/http/request.ts`** – supplies `callerContextOf`, which extracts the authenticated admin's context for the audit row.
- **`src/infrastructure/http/response.ts`** – supplies `successResponse`, the canonical way to emit a typed success payload.

## Notes

- Returns **200**, not 201, on successful receipt creation. Match this convention if adding sibling controllers.
- Early-returns (without a `response` send) when body validation fails—`parseBody` is responsible for sending the 400 itself.
- The JSDoc calls a receipt "one of only two ways units can enter the shop"; the other entry point is presumably a different module/route.
- `callerContextOf(request)` is forwarded to the service, so the service layer is expected to persist *who* added the stock, not just *how much*.
