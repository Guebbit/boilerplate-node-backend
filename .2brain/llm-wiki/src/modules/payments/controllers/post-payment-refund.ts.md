---
source: src/modules/payments/controllers/post-payment-refund.ts
sha256: 138126f2554b2bbf1b98b2cf451f37774208783cdfd662eaacf6e2ce044e65ae
generated_at: 2026-09-23T19:17:35.518320+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund.ts

## Purpose

Thin Express controller for `POST /payments/order/:orderId/refund`. It performs a standalone monetary refund on an order without altering the order's status, giving an operator the ability to refund alone (as opposed to the "cancel + refund" flow where the client issues both calls). All business logic is delegated to `paymentService.refundByOrder`; this file only wires the HTTP layer to the service result.

## Key elements

- **`postPaymentRefund`** (exported const) — The sole export. Accepts an Express `Request<{ orderId?: string }>` and `Response`. Calls `paymentService.refundByOrder(orderId, authContext, callerContext)`, then:
    - If the result is a refusal, short-circuits via `refused(response, result)`.
    - On success, serializes the domain object with `.toJSON()` (which applies the model's `_id → id` and date → ISO-string transform) and sends it through `successResponse<Payment>` with status 200.
    - On thrown error, delegates to `catchAs(response, 'postPaymentRefund')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (async error formatting) and `refused` (result-shape check that writes the refusal response and returns a truthy value to skip the success path).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts the caller's context from the request for the service call.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard envelope writer.
- **`src/modules/payments/services/index.ts`** — Supplies `paymentService`, specifically its `refundByOrder` method (the actual refund logic).
- **`src/modules/payments/routes.ts`** — Registers this handler on the `POST /payments/order/:orderId/refund` path (admin-only guard lives there, not here).
- **`src/types/index.ts`** — Supplies the `Payment` type used in the success-response cast.

## Notes

- The controller does **not** mutate order status. "Cancel and refund" is modeled as two separate HTTP calls from the client; this endpoint covers the refund half only.
- `request.params.orderId` is typed `string | undefined` by the Express generic but is unconditionally wrapped in `String()` before being passed to the service — treat it as always present at runtime (the route pattern guarantees it).
- The `.toJSON()` call is load-bearing: without it the response would contain the raw Mongoose `ObjectId` under `_id` and native `Date` objects rather than the `Payment` shape consumers expect.
- Auth enforcement (admin-only) is applied in `routes.ts`; nothing in this file checks permissions.
