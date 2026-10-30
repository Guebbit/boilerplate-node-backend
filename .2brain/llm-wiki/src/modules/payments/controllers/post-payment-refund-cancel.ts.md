---
source: src/modules/payments/controllers/post-payment-refund-cancel.ts
sha256: dbfa7fbd21401a877f9498894dde3112c4e1396aab5e7ae4e2a809f581275daa
generated_at: 2026-10-29T05:03:19.899276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-refund-cancel.ts

## Purpose

Controller for `POST /payments/:id/refunds/:refundId/cancel`. Lets staff void a refund before it is paid. It validates path params and the request body, delegates to the payment service, and returns the now-voided refund. Business rules (refusing already-closed refunds or ones that may have moved money) live in the service layer, not here.

## Key elements

- **`postPaymentRefundCancel(request, response)`** — the sole export. Extracts `paymentId` and `refundId` from params, parses the body against `CancelRefundBody` (from `@api/schemas.zod`), calls `paymentService.cancelRefund(...)`, and responds 200 with the voided refund object.
- **Id validation** — uses `requireId` twice (for `id` and `refundId`); short-circuits with 404 on missing/invalid values.
- **Body parsing** — `parseBody(CancelRefundBody, …)` validates the `note` field (the only expected body content).
- **Refusal handling** — `refused(response, result)` maps a service-level refusal (e.g. refund already closed, money already moved) to an appropriate HTTP error response.
- **Success path** — fetches the cancelled refund via `paymentService.refundOf(…)` and sends it with `successResponse(response, refund, 200)`. A defensive `throw` guards the (documented-unreachable) case where the refund is missing from the payment.
- **Error boundary** — `.catch(catchAs(response, 'postPaymentRefundCancel'))` normalises any thrown error into a consistent error response.

## Relationships

- **`src/modules/payments/services/index.ts`** — the primary dependency. `paymentService.cancelRefund` performs the state transition; `paymentService.refundOf` retrieves the voided refund for the response.
- **`src/infrastructure/http/controller.ts`** — provides the `catchAs`, `parseBody`, and `refused` helpers used throughout the handler.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` for typed param extraction and 404 short-circuiting.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to pass the caller's context into the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the final 200 reply.
- **`src/modules/payments/routes.ts`** — registers this controller against the `POST /payments/:id/refunds/:refundId/cancel` route (the route also enforces the `create:Refund` permission and fresh-session requirement noted in the file's doc comment).

## Notes

- The route-level permission (`create:Refund`) and fresh-session check are applied by the router, not by this controller.
- The `throw new Error('a canceled refund is missing from its payment')` line is a defensive invariant the team expects to be unreachable; if it fires, it is a programming error, not a client-facing condition.
- `CancelRefundBody` comes from `@api/schemas.zod`, an external API-schema package, not from the payments module itself.
