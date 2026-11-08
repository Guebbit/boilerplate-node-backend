---
source: src/modules/payments/controllers/post-payment-refund.ts
sha256: 0d02cde96a5de4080bc036ff1d59d4d2de5bd654200ccb2061b018865e3a280f
generated_at: 2026-11-08T07:18:39.202082+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund.ts

## Purpose

Handler for `POST /payments/:id/refunds`. Processes a standalone (admin-initiated) full or partial refund on a payment without altering the associated order's status. Returns **201** with the new `Refund` record and a `Location` header identifying it.

## Key elements

- **`postPaymentRefund`** (exported) — The sole export. Validates the `:id` param, parses the request body against `CreateRefundBody` (Zod), delegates to `paymentService.refundPayment`, resolves the resulting `Refund` via `paymentService.refundOf`, and replies with `createdResponse`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs`, the shared HTTP validation/error helpers used throughout the handler.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` to extract and validate the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to build the caller context passed into the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `createdResponse` for the 201 reply.
- **`src/modules/payments/services/index.ts`** — Provides `paymentService`, whose `refundPayment` and `refundOf` methods perform the actual business logic.
- **`src/modules/payments/routes.ts`** — Registers `postPaymentRefund` at the `POST /payments/:id/refunds` route (and enforces admin-only auth there).

## Notes

- **Separation of concerns with order cancel:** The doc comment explicitly states that "cancel and refund" is modeled as two independent client calls (this refund + a separate order-cancel). This controller must never touch order status.
- **Defensive unreachable check:** After a successful `refundPayment`, the code looks up the `Refund` on the payment and throws if it is missing. The comment marks this path as unreachable; it exists purely as a safety net.
- **Auth is route-level, not controller-level:** Admin-only enforcement lives in `routes.ts`, not here. The handler receives `request.authContext` and forwards it to the service but does no permission check itself.
- **No direct provider dependency:** Although `src/modules/payments/providers/index.ts` appears in the dependency graph, this file does not import or reference it; any provider usage is internal to the service layer.
