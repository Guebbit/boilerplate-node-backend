---
source: src/modules/payments/controllers/get-payment.ts
source_sha256: 54e86142debc9fcaae275ec6e3015c0a3b2336b57f22a3a667289adf27ebf6b8
context_sha256: def1757b6c8850776639aacb1b082e0112ad0ddf6c00597fd02fdcb91b2701b3
generated_at: 2026-11-22T06:41:15.883476+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/get-payment.ts

## Purpose
Express controller for `GET /payments/:id`. It returns a single payment by its own id. Per the module doc, this is where `Location` points after `POST /payments`, and the read that the operator-refund answer sends a client back to.

## Key elements
- `getPayment(request, response)`: the only export. It does the following:
  1. Validates the `:id` param with `requireId`, using the not-found key `payments.not-found`. If there is no valid id, it returns `Promise.resolve()` and stops, relying on `requireId` having already written the response.
  2. Calls `paymentService.getById(id, request.authContext)`.
  3. If `refused(response, result)` handles the result, it returns without further output.
  4. Otherwise it sends `successResponse<Payment>(response, result.data)`.
  5. Any rejection goes to `catchAs(response, 'getPayment')`.

## Relationships
- `src/infrastructure/http/ids.ts`: provides `requireId`, which extracts and validates the route id.
- `src/infrastructure/http/response.ts`: provides `successResponse`, which sends the success payload.
- `src/infrastructure/http/controller.ts`: provides `refused` (handles non-success service results) and `catchAs` (error handler labelled with the controller name).
- `src/modules/payments/services/index.ts`: provides `paymentService`, whose `getById` does the actual lookup.
- `src/types/index.ts`: provides the `Payment` type (imported via the `@types` alias) used to type the response.
- `src/modules/payments/routes.ts`: wires this handler to the `GET /payments/:id` route.

## Notes
- The handler always returns a Promise, including on the early-exit path, so callers can treat it uniformly.
- `request.authContext` is passed to the service, so authorization is handled there rather than in the controller.
