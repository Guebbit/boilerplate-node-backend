---
source: src/modules/payments/controllers/get-refund.ts
source_sha256: 40b42389a288c934f4c467aafb23fd495cb698245de315542879af98cd55eeb6
context_sha256: def1757b6c8850776639aacb1b082e0112ad0ddf6c00597fd02fdcb91b2701b3
generated_at: 2026-11-22T06:41:27.304923+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/get-refund.ts

## Purpose
Express controller for `GET /payments/:id/refunds/:refundId`. It returns a single refund record addressed through its parent payment, and is the target that `Location` points to after `POST /payments/:id/refunds`.

## Key elements
- `getRefund(request, response)`: the exported handler.
  - Validates the `id` and `refundId` path params with `requireId`. Both use `notFound: 'payments.not-found'`, and the second call passes `name: 'refundId'`. If either id is invalid, it returns `Promise.resolve()` without continuing, so `requireId` is expected to have already written the response.
  - Calls `paymentService.getRefund(paymentId, refundId, request.authContext)`.
  - If `refused(response, result)` is true, it returns and sends nothing more. Otherwise it responds with `successResponse<Refund>(response, result.data)`.
  - Rejections go to `catchAs(response, 'getRefund')`.

## Relationships
- `src/infrastructure/http/ids.ts`: provides `requireId`, which validates each path param.
- `src/infrastructure/http/controller.ts`: provides `refused`, which handles a refused service result, and `catchAs`, the error handler for the promise chain.
- `src/infrastructure/http/response.ts`: provides `successResponse`, which sends the success payload.
- `src/modules/payments/services/index.ts`: provides `paymentService`, which does the lookup and any authorization using `authContext`.
- `src/types/index.ts`: provides the `Refund` type used to type the response.
- `src/modules/payments/routes.ts`: the neighbor most likely to mount this handler. The file itself does not show this.

## Notes
- An invalid or unknown `refundId` returns the same `payments.not-found` key as an unknown payment. A code comment says the refund id is only ever read through its payment.
- The handler returns a Promise on every path (`Promise.resolve()` on early exit), so callers can treat it uniformly.
