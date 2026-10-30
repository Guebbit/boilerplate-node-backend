---
source: src/modules/payments/controllers/post-order-payment.ts
sha256: 9a0c34053cb133a9c5f91b9193b8aeb6e8b44250685b743d9824498f87e75233
generated_at: 2026-10-29T05:02:56.964389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-order-payment.ts

## Purpose

HTTP controller for `POST /orders/:id/payments`. Lets an admin record an offline payment — money the card provider never saw — against an existing order. Thin adapter: extracts the order ID, validates the body, delegates to `paymentService.recordOfflinePayment`, and shapes the HTTP response.

## Key elements

- **`postOrderPayment`** (exported) — the request handler. Validates `:id` param, parses the body against `RecordOrderPaymentBody`, calls the service, and returns the payment with its actions attached.
- **`requireId`** (from `@infrastructure/http/ids`) — pulls and validates the order ID from route params; short-circuits with 404 on failure.
- **`parseBody`** (from `@infrastructure/http/controller`) — runs the Zod schema against `request.body`; short-circuits with 400 on failure.
- **`callerContextOf`** (from `@infrastructure/http/request`) — extracts the authenticated caller's context to pass into the service.
- **`paymentService.recordOfflinePayment`** — the actual domain operation (in `src/modules/payments/services`).
- **`paymentService.withActions(result.data, undefined, request.authContext)`** — attaches available actions to the payment payload. The order argument is intentionally `undefined` (no order read needed).
- **`createdOrOk`** (from `@infrastructure/http/response`) — sends **201** when a new row was inserted, **200** when the call converted an existing unpaid card-intent row.
- **`refused` / `catchAs`** (from `@infrastructure/http/controller`) — standard rejection and error-response helpers.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/payments/order-routes.ts` | Registers `postOrderPayment` at `POST /orders/:id/payments`; guards it with the `create:Payment` permission. |
| `src/modules/payments/services/index.ts` | Source of `paymentService`; this file calls `recordOfflinePayment` and `withActions`. |
| `src/infrastructure/http/controller.ts` | Supplies `catchAs`, `parseBody`, `refused` helpers. |
| `src/infrastructure/http/ids.ts` | Supplies `requireId`. |
| `src/infrastructure/http/request.ts` | Supplies `callerContextOf`. |
| `src/infrastructure/http/response.ts` | Supplies `createdOrOk`. |
| `src/types/index.ts` | Source of the `Payment` type used as the response payload type. |

## Notes

- **201 vs 200 is meaningful.** The service result carries a `status` field that drives `createdOrOk`; the controller does not decide this itself.
- **No order read in the controller.** `withActions` receives `undefined` for the order because an offline payment's `pay` flag is always `false`, so action resolution doesn't need order state.
- **Audit/analytics events fire inside the service**, not in this controller — same pattern as the confirm flow.
- The handler is **admin-only** at the route level (`create:Payment`); no additional auth check appears here.
