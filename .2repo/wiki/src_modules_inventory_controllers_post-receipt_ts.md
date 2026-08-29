# src/modules/inventory/controllers/post-receipt.ts

## Purpose

Express controller for `POST /inventory/receipts`. Handles the arrival of units from a supplier by validating the request body, delegating to the inventory service, and returning a structured HTTP response. It is one of only two entry points for stock to enter the shop and is audited (the receipt row records which admin added how many).

## Key elements

- **`postReceipt(request, response)`** — The sole export. Validates the body against the `ReceiveStockBody` Zod schema, extracts `productId`, `quantity`, and `note`, then calls `inventoryService.receive(...)` with the caller context. Responds with a success payload or an error/refusal via the shared HTTP helpers.

## Relationships

- **`@infrastructure/http/controller`** — Supplies the `parseBody`, `refused`, and `catchAs` utilities used for validation, rejection handling, and error serialization.
- **`@infrastructure/http/request`** — Supplies `callerContextOf(request)` to attach the authenticated admin's identity to the service call.
- **`@infrastructure/http/response`** — Supplies `successResponse` for the happy-path reply.
- **`src/modules/inventory/routes.ts`** — Registers `postReceipt` as the handler for the `POST /inventory/receipts` route.
- **`src/modules/inventory/service.ts`** — Provides `inventoryService.receive(productId, quantity, note, callerContext)` which performs the actual stock-in write and returns a result discriminated union (success vs. refusal).

## Notes

- The controller is intentionally thin: no business logic lives here. All domain rules (availability, permissions, idempotency) belong to `inventoryService.receive`.
- `refused(response, result)` short-circuits the promise chain with `return` when the service signals a domain-level rejection (e.g. insufficient quantity), so the caller never reaches `successResponse`.
- The audit requirement (admin + quantity recorded) is enforced inside the service via the `callerContextOf` value passed in; the controller does not inspect or modify it.
