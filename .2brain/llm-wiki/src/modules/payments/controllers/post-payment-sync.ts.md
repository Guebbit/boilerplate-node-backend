---
source: src/modules/payments/controllers/post-payment-sync.ts
source_sha256: 05cac0d87ba537db3fd2c2a9f6288345a38806d3d95ce393b6455c9b86f7b06b
context_sha256: 2b11a8932331186b7b9c41ca6c9d1c12d9a524c489bf887d342d26184e3da6c4
generated_at: 2026-11-22T06:42:35.395383+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment-sync.ts

## Purpose
Express controller for `POST /payments/:id/sync`. The browser calls it after finishing a step at the payment provider (e.g. a 3-D Secure challenge or a wallet sheet closing). It re-reads the provider's record and applies it, so the happy path feels synchronous while the webhook remains the authority. It is idempotent: an already-settled payment is answered without querying the provider.

## Key elements
- `postPaymentSync(request, response)`: the only export, the route handler.
  - Validates the `:id` param with `requireId`, using the `payments.not-found` message key. If the id is missing or invalid it returns, since `requireId` has already handled the response.
  - Calls `paymentService.syncPayment(paymentId, request.authContext, callerContextOf(request))`.
  - If `refused(response, result)` reports the result was refused, it stops there.
  - Otherwise it calls `paymentService.presentWithActions(result.data, request.authContext)` and sends the payment with `successResponse<Payment>(..., 200)`.
  - Errors from the promise chain go to `catchAs(response, 'postPaymentSync')`.

## Relationships
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the payment id.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the 200 JSON response.
- `src/infrastructure/http/controller.ts`: `refused` (short-circuits on service refusals) and `catchAs` (error handling labelled with the handler name).
- `src/modules/payments/services/index.ts`: supplies `paymentService`, which provides `syncPayment` and `presentWithActions`.
- `src/types/index.ts`: supplies the `Payment` type for the response.
- `src/modules/payments/routes.ts`: presumably mounts this handler on the route (not visible in this file).

## Notes
- The handler does no business logic itself. Syncing and presentation both live in `paymentService`.
- `request.authContext` is read directly from the request, so auth middleware must have populated it earlier.
- The handler returns promises rather than being `async`. Failures are handled by `catchAs`, not `try/catch`.
