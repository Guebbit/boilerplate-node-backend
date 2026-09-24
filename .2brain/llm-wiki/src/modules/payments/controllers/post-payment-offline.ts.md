---
source: src/modules/payments/controllers/post-payment-offline.ts
sha256: 3109fe5fdb1fc8a87d31138f387c6f7284c9b1f6af8adbfc3609caca4ac63758
generated_at: 2026-09-23T19:17:25.082946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-offline.ts

## Purpose

Thin Express controller for `POST /payments/order/:orderId/offline`. It validates the request body against a Zod schema, delegates to the payment service to record a payment the card provider never saw (admin-only, enforced at the route), and replies **201** with the persisted `Payment` object.

## Key elements

- **`postPaymentOffline`** *(exported)* — The sole route handler. Accepts `Request<{ orderId?: string }>` and `Response`.
  1. `parseBody(RecordOfflinePaymentBody, …)` validates the JSON body; bails early on failure.
  2. Calls `paymentService.recordOfflinePayment(orderId, body, callerContext)`.
  3. On a `refused` result, short-circuits via `refused(response, result)`.
  4. On success, sends `successResponse<Payment>(…, 201, …)` using `result.data.toJSON()` to apply the model's `_id → id` / date-to-ISO-string transform.
  5. `.catch(catchAs(response, 'postPaymentOffline'))` funnels any thrown error through the shared error handler.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/controller` | Provides `catchAs`, `parseBody`, `refused` — the three shared controller utilities used here. |
| `@infrastructure/http/request` | `callerContextOf(request)` extracts the authenticated caller's context for the service call. |
| `@infrastructure/http/response` | `successResponse` builds the 201 JSON reply. |
| `../services` (payments services index) | Source of `paymentService.recordOfflinePayment`, the sole business-logic call. |
| `payments/routes.ts` | Registers this handler on the route and enforces the `payments.any.create` permission (admin-only). |
| `@types` (types index) | Supplies the `Payment` interface used to type the success response payload. |

## Notes

- **`result.data.toJSON()` is load-bearing.** Without it the Mongoose document would serialise with `_id` and native `Date` objects; the cast to `Payment` is safe only *after* that call.
- **Audit / analytics events are not fired here.** They originate in the service layer once settlement actually lands — the same pattern as the confirm flow.
- **No auth check in this file.** The `payments.any.create` guard lives in `routes.ts`; this handler assumes the request already passed that gate.
