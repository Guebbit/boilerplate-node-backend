---
source: src/modules/payments/controllers/post-payment-refund.ts
source_sha256: 0d02cde96a5de4080bc036ff1d59d4d2de5bd654200ccb2061b018865e3a280f
context_sha256: 5ce1fd43cc810858f4827ac1f677e2d04a235b0d888cfac4a780d0106f0991ca
generated_at: 2026-11-22T06:42:23.149660+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment-refund.ts

## Purpose
Express controller for `POST /payments/:id/refunds`. It refunds all or part of a payment without changing the status of the payment's order, giving operators a standalone refund. On success it responds 201 with the new `Refund` record and a `Location` header. The route is admin-only. "Cancel and refund" is done by a client sending this request and the order cancel separately, so an operator can do either one alone.

## Key elements
- `postPaymentRefund(request, response)`: the exported handler. Its steps:
  1. Resolves the payment id with `requireId`, using the `payments.not-found` error key, and returns early if it is missing.
  2. Validates `request.body` (defaulting to `{}`) against `CreateRefundBody` with `parseBody`, and returns early on failure.
  3. Calls `paymentService.refundPayment(paymentId, request.authContext, callerContextOf(request), body)`.
  4. If `refused(response, result)` handles the result, it stops. Otherwise it destructures `{ payment, refundId }` from `result.data`.
  5. Looks up the new record with `paymentService.refundOf(payment, refundId, request.authContext)`.
  6. Sends `createdResponse(response, refund, "/payments/${paymentId}/refunds/${refund.id}")`.
  7. Any rejection goes to `catchAs(response, 'postPaymentRefund')`.

## Relationships
- `src/infrastructure/http/ids.ts`: `requireId` parses and validates the `:id` path parameter.
- `src/infrastructure/http/controller.ts`: provides `parseBody` (schema validation), `refused` (turns a refused service result into a response) and `catchAs` (the error handler for the promise chain).
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `createdResponse` writes the 201 response and `Location`.
- `src/modules/payments/services/index.ts`: exports `paymentService`, which performs the refund (`refundPayment`) and returns the public refund view (`refundOf`).
- `src/modules/payments/routes.ts`: this is where the handler is mounted. The file's doc comment says the admin-only restriction is applied there.
- `src/modules/payments/providers/index.ts`: the file does not import it directly, so there is no visible interaction.

## Notes
- The handler returns a promise, but the early `return;` branches return nothing.
- The `if (!refund) throw ...` branch is commented as unreachable on success. If it were hit, the thrown error would be handled by `catchAs`.
- The `Location` path is built from the request's `paymentId` and the new `refund.id`.
- The request body schema `CreateRefundBody` is imported from `@api/schemas.zod`.
