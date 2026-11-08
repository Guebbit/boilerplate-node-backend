---
source: src/modules/payments/controllers/post-payment-refund-settle.ts
sha256: c4576cc4a59e284dfbf289d9dd062e3502ea0157091a5d0742af7424e44a8994
generated_at: 2026-11-08T07:18:25.668286+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund-settle.ts

## Purpose

Express controller for `POST /payments/:id/refunds/:refundId/settle`. It lets an operator confirm that a refund's funds have been returned outside the application, then responds with the settled refund object. The handler validates both path IDs, delegates to the payment service, and formats the success or error response.

## Key elements

- **`postPaymentRefundSettle`** (exported) – The sole handler. Extracts `paymentId` and `refundId` from the path, calls `paymentService.settleRefundByHand`, resolves the specific refund via `paymentService.refundOf`, and sends a 200 with the refund body. On service refusal it short-circuits via `refused`; on unexpected errors it delegates to `catchAs`.

## Relationships

- **`src/modules/payments/services/index.ts`** – Primary dependency; calls `paymentService.settleRefundByHand` and `paymentService.refundOf`.
- **`src/infrastructure/http/controller.ts`** – Supplies the `catchAs` (error-to-response) and `refused` (service-rejection check) helpers.
- **`src/infrastructure/http/ids.ts`** – Supplies `requireId` for safe extraction/validation of the two path parameters.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf` to pass operator context into the service call.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse` for the final 200 reply.
- **`src/modules/payments/routes.ts`** – Registers this handler on the `POST /payments/:id/refunds/:refundId/settle` route (handler is consumed there; not imported by this file).

## Notes

- The null-check after `refundOf` is defensive and annotated as unreachable on a success path; it throws a plain `Error` that will be caught by the `catchAs` handler.
- `request.authContext` is read directly (not via an imported helper), implying the route layer or middleware attaches it before this handler runs.
- The promise chain uses `.then()/.catch()` rather than `async/await`, consistent with the surrounding controller style.
