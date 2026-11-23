---
source: src/modules/payments/controllers/post-payment-refunds-sync.ts
source_sha256: 37085006501086fced25b1d4da95bd4c829a4a7f9084cf431a537f8a41ecd37e
context_sha256: def1757b6c8850776639aacb1b082e0112ad0ddf6c00597fd02fdcb91b2701b3
generated_at: 2026-11-22T06:42:28.464608+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment-refunds-sync.ts

## Purpose
Express controller for `POST /payments/:id/refunds/sync`. It lets staff re-run the import of refunds that were made in the payment provider's dashboard. It responds with the payment as it now stands, including its `actions`.

## Key elements
- `postPaymentRefundsSync(request, response)`: the only export.
  1. Reads the payment id with `requireId`, using the `payments.not-found` error key. If the id is missing or invalid it returns, since `requireId` has already handled the response.
  2. Calls `paymentService.syncRefunds(paymentId, request.authContext)`.
  3. If `refused(response, result)` reports a refusal, it stops.
  4. Otherwise it calls `paymentService.presentWithActions(result.data, request.authContext)` and sends the result with `successResponse<Payment>(response, payment, 200)`.
  5. Any rejection goes to `catchAs(response, 'postPaymentRefundsSync')`.

## Relationships
- `src/infrastructure/http/ids.ts`: supplies `requireId` for id parsing and the not-found response.
- `src/infrastructure/http/controller.ts`: supplies `refused`, which short-circuits on a service refusal, and `catchAs`, the error handler.
- `src/infrastructure/http/response.ts`: supplies `successResponse` for the 200 reply.
- `src/modules/payments/services/index.ts`: supplies `paymentService`, which provides `syncRefunds` and `presentWithActions`.
- `src/types/index.ts`: supplies the `Payment` type for the response payload.
- `src/modules/payments/routes.ts`: mounts this handler. According to the module doc, the route applies the `create:Refund` permission and the fresh-session requirement. This file does not check either.

## Notes
- The sync is idempotent: a refund that is already recorded is never imported twice.
- Authorization lives on the route, not in the controller. The controller only passes `request.authContext` to the service.
- The handler is not `async`. It uses promise chains and returns early with no value on refusal.
