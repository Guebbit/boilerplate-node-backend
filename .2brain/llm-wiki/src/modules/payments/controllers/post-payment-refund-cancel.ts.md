---
source: src/modules/payments/controllers/post-payment-refund-cancel.ts
source_sha256: dbfa7fbd21401a877f9498894dde3112c4e1396aab5e7ae4e2a809f581275daa
context_sha256: 5ce1fd43cc810858f4827ac1f677e2d04a235b0d888cfac4a780d0106f0991ca
generated_at: 2026-11-22T06:42:04.821207+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment-refund-cancel.ts

## Purpose
Express controller for `POST /payments/:id/refunds/:refundId/cancel`. It lets staff void a refund that must never be paid, and it responds with the voided refund. Authorization (`create:Refund`) and the fresh-session requirement are enforced at the route. The service refuses to cancel a refund that is already closed or one that may have moved money.

## Key elements
- `postPaymentRefundCancel(request, response)`: the exported handler. It runs these steps in order:
  1. Reads the payment id with `requireId`, using the not-found code `payments.not-found`.
  2. Reads `refundId` with `requireId` in the same way, passing `name: 'refundId'`.
  3. Validates the body against `CancelRefundBody` using `parseBody`.
  4. Calls `paymentService.cancelRefund(paymentId, refundId, body.note, request.authContext, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it returns without further handling.
  6. Otherwise it picks the cancelled refund out of the returned payment with `paymentService.refundOf(result.data, refundId, request.authContext)`.
  7. Sends that refund with `successResponse(response, refund, 200)`.
- Each early exit (invalid id or body) returns without calling the service, since the helpers have already written the response.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`. `catchAs(response, 'postPaymentRefundCancel')` is the final `.catch`.
- `src/infrastructure/http/ids.ts`: supplies `requireId`, which extracts and validates the path ids.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which writes the 200 response.
- `src/modules/payments/services/index.ts`: supplies `paymentService`, which provides `cancelRefund` and `refundOf`.
- `src/modules/payments/routes.ts`: the route module that mounts this handler (inferred from the neighbor relationship and the module doc).
- `src/modules/payments/providers/index.ts`: no direct use in this file.

## Notes
- `cancelRefund` returns the updated payment, not the refund. The controller extracts the refund from it with `refundOf`.
- If the refund is missing from the returned payment, the handler throws `'a canceled refund is missing from its payment'`. The code comments that this cannot happen on a success. The throw is handled by `catchAs`.
- The request type is `Request<{ id?: string; refundId?: string }>`, so both params are optional strings until `requireId` validates them.
