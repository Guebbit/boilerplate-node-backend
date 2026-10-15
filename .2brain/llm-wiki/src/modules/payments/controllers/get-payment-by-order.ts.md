---
source: src/modules/payments/controllers/get-payment-by-order.ts
sha256: 5701b7bcf380aae21ff81d19e1ee0be319633cceb9d1154e5a35b1487bca48b4
generated_at: 2026-10-15T11:23:20.206474+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/get-payment-by-order.ts

## Purpose
Controller handler for `GET /payments/order/:orderId`. It retrieves the payment (intent and status) tied to a given order so that the order page's payment panel can rehydrate its state on reload rather than forcing the user to restart the payment flow.

## Key elements
- **`getPaymentByOrder`** (exported) – Express handler that validates the `orderId` path param, delegates to `paymentService.getForOrder`, and sends either a success response (`Payment` payload), a refusal response, or a caught-error response.
- **`requireId`** call – Validates that `orderId` exists on the request; if missing, it sends a 404 with the `payments.not-found` code and the handler returns early.
- **`refused`** – Checks the service result for a refusal condition; if true, the response is already sent and the handler exits.
- **`catchAs`** – Catches any thrown error and maps it to a structured error response tagged with the handler name.

## Relationships
- **`src/modules/payments/routes.ts`** – Registers this handler on the `GET /payments/order/:orderId` route.
- **`src/modules/payments/services/index.ts`** – Source of `paymentService`; the handler calls `paymentService.getForOrder(orderId, request.authContext)`.
- **`src/infrastructure/http/ids.ts`** – Provides `requireId` for path-parameter validation.
- **`src/infrastructure/http/controller.ts`** – Provides `catchAs` (error mapping) and `refused` (refusal check).
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` for the happy-path JSON reply.
- **`src/types/index.ts`** – Supplies the `Payment` type used as the response payload generic.

## Notes
- The request param type is declared as `{ orderId?: string }` (optional) because `requireId` is responsible for the validation; the handler treats a `null`/`undefined` return as "already responded" and bails out.
- `request.authContext` is forwarded into the service call, meaning the service performs its own authorization scoping—this controller does not check roles directly.
- The early `if (!orderId) return Promise.resolve()` pattern is the established convention for exiting after `requireId` has already sent an error response.
