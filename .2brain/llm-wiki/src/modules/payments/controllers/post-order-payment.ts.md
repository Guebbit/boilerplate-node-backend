---
source: src/modules/payments/controllers/post-order-payment.ts
sha256: 9a0c34053cb133a9c5f91b9193b8aeb6e8b44250685b743d9824498f87e75233
generated_at: 2026-11-08T07:17:53.512737+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-order-payment.ts

## Purpose

HTTP handler for `POST /orders/:id/payments`. Records an offline payment (money that never passed through the card provider) against an existing order. The permission gate (`create:Payment`, admin-only) is enforced at the route level, not here.

## Key elements

- **`postOrderPayment(request, response)`** — The sole export. Validates the order ID param, parses the request body against the `RecordOrderPaymentBody` Zod schema, delegates to `paymentService.recordOfflinePayment`, and responds with `201` (new row inserted) or `200` (converted an existing unpaid card-intent row). The returned `Payment` is augmented via `paymentService.withActions` before being sent.

## Relationships

- **`src/modules/payments/order-routes.ts`** — The route definition that imports and wires this handler to the `POST /orders/:id/payments` path and applies the admin-only guard.
- **`src/modules/payments/services/index.ts`** — Supplies `paymentService`, whose `recordOfflinePayment` performs the actual write and fires audit/analytics events; `withActions` enriches the result for the response.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody`, `refused`, and `catchAs` used for schema validation, rejection short-circuiting, and error mapping.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for extracting and validating the `:id` param.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to pass the authenticated caller's context into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `createdOrOk` to emit the appropriate status code and `Location` header.
- **`src/types/index.ts`** — Source of the `Payment` type used to type the response payload.

## Notes

- The `pay` field on the resulting payment is always `false` here, regardless of what the order's state might suggest; no order read is performed (the `withActions` call passes `undefined` for the order slot).
- Audit and analytics events are **not** fired in this controller; they originate inside `paymentService.recordOfflinePayment` once settlement lands, mirroring the confirm flow.
- The `201` vs `200` distinction is driven by `result.status` returned from the service, not by anything the controller decides.
