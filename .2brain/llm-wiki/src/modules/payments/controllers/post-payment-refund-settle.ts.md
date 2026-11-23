---
source: src/modules/payments/controllers/post-payment-refund-settle.ts
source_sha256: c4576cc4a59e284dfbf289d9dd062e3502ea0157091a5d0742af7424e44a8994
context_sha256: 5ce1fd43cc810858f4827ac1f677e2d04a235b0d888cfac4a780d0106f0991ca
generated_at: 2026-11-22T06:42:10.436857+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment-refund-settle.ts

## Purpose
Express controller for `POST /payments/:id/refunds/:refundId/settle`. It lets an operator confirm that a refund's money went back outside the application (a manual settlement), and responds with the refund that was settled.

## Key elements
- `postPaymentRefundSettle(request, response)`: the exported handler.
  - Validates both `id` and `refundId` path params with `requireId`, using the `payments.not-found` error key. It returns early if either is invalid (`requireId` handles the response).
  - Calls `paymentService.settleRefundByHand(paymentId, refundId, request.authContext, callerContextOf(request))`.
  - If `refused(response, result)` reports a refusal, it stops there.
  - Otherwise it reads the settled refund with `paymentService.refundOf(result.data, refundId, request.authContext)` and sends it with `successResponse(response, refund, 200)`.
  - Rejections go to `catchAs(response, 'postPaymentRefundSettle')`.

## Relationships
- `src/infrastructure/http/ids.ts`: `requireId` parses and validates the `id` and `refundId` params.
- `src/infrastructure/http/controller.ts`: `refused` handles service refusals, and `catchAs` handles thrown errors.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the 200 response.
- `src/modules/payments/services/index.ts`: supplies `paymentService`, which provides `settleRefundByHand` and `refundOf`.
- `src/modules/payments/routes.ts`: mounts this handler. Per the file header, the route carries the `create:Refund` permission and the fresh-session requirement.
- `src/modules/payments/providers/index.ts`: no direct interaction is visible in this file.

## Notes
- Authorization (`create:Refund`, fresh session) is enforced at the route, not here.
- The service itself refuses a refund that has no final answer yet and one that has already been settled. This controller only relays those refusals via `refused`.
- The `if (!refund) throw ...` branch is commented as unreachable on success. The settled refund should always be on the returned payment.
