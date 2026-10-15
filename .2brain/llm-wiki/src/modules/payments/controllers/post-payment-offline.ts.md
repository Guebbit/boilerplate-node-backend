---
source: src/modules/payments/controllers/post-payment-offline.ts
sha256: 6a228fee54925527425df9deaebab5a6215726e38ee73f8c98412c5d2fe54da3
generated_at: 2026-10-15T11:24:08.258228+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-offline.ts

## Purpose

Controller handler for `POST /payments/order/:orderId/offline`. An admin endpoint for recording a payment the card provider never saw (e.g. cash, in-person, manual settlement). Audit and analytics events are emitted by the service layer at settlement time, mirroring the offline-confirm flow.

## Key elements

- **`postPaymentOffline(request, response)`** — The sole export. Validates the `orderId` param, parses the request body against `RecordOfflinePaymentBody` (from `@api/schemas.zod`), delegates to `paymentService.recordOfflinePayment`, then serialises the result via `presentPayment` and responds with 201 (new row inserted) or 200 (an existing unpaid card-intent row was converted). Errors are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error mapping), `parseBody` (Zod body validation), and `refused` (4xx short-circuit for service-level rejections).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` to extract and validate the `orderId` route param, responding 404 with a localised code if missing.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated caller's context for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `createdOrOk` to emit the correct 201/200 status with the `Payment` payload and a `Location` header.
- **`src/modules/payments/presenter.ts`** — Provides `presentPayment` to shape the service result into the API-visible `Payment` object, respecting the caller's read permissions (`readsAllPayments`).
- **`src/modules/payments/routes.ts`** — Registers this handler on the `POST /payments/order/:orderId/offline` route with the `payments.any.create` guard.
- **`src/modules/payments/services/index.ts`** — Exports `paymentService.recordOfflinePayment` (the business logic) and `readsAllPayments` (a permission predicate).
- **`src/types/index.ts`** — Provides the `Payment` type used as the response generic.

## Notes

- The 201-vs-200 distinction is driven by `result.status` from the service: 201 means a new row was created; 200 means an existing unpaid card-intent row was repurposed. The controller does not decide this—it trusts the service.
- The handler is admin-only at the route level (`payments.any.create`); no additional role check lives in this file.
- `RecordOfflinePaymentBody` is imported from `@api/schemas.zod`, which is outside the listed graph neighbors; its shape is not visible here.
