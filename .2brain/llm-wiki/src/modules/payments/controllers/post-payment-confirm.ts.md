---
source: src/modules/payments/controllers/post-payment-confirm.ts
sha256: c007e5a509bb448beb402e1536bdc6ffa4873fcefbab220e631f341c4fcb9d63
generated_at: 2026-10-29T05:03:07.690523+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-confirm.ts

## Purpose

HTTP handler for `POST /payments/:id/confirm` — the step where the browser hands over the tokenised payment method reference and the payment is actually attempted. It maps the service result to three HTTP outcomes (succeeded, in-flight, declined) and fires the associated metrics and audit context.

## Key elements

- **`postPaymentConfirm(request, response)`** — the sole export. Validates the route param (`:id`), parses the JSON body against `ConfirmPaymentBody` (zod), then delegates to `paymentService.confirmPayment`.
- **Decline detection** — after the service call, checks for `ERROR_CODES.PAYMENT_DECLINED` in the result's error list and sets `request.paymentConfirmDeclined = true` so the downstream decline-budget rate limiter can distinguish a genuine card decline from the route's other 409.
- **Metrics** — increments `paymentConfirmTotal` with one of three labels: `succeeded`, `in_flight`, or `declined`. Not-found / race rejections are intentionally not counted.
- **In-flight path** — a `requires_action` or `processing` result is a 200 (not a 4xx) so the browser proceeds to the provider's next step. The payment is re-fetched via `paymentService.presentWithActions` to include any `actions` payload the form needs.
- **Error path** — `refused(response, result)` serialises non-success results (e.g. 409 `PAYMENT_DECLINED`); unhandled rejections are caught by `catchAs`.

## Relationships

- **`src/modules/payments/services/index.ts`** — calls `paymentService.confirmPayment` and `paymentService.presentWithActions`.
- **`src/modules/payments/metrics.ts`** — increments `paymentConfirmTotal`.
- **`src/modules/payments/routes.ts`** — registers this function as the handler for `POST /payments/:id/confirm`.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, `parseBody`, and `refused` helpers.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` for the `:id` route param.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` (extracts audit caller metadata).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 path.
- **`src/types/index.ts`** — supplies the `Payment` type used in the success response.

## Notes

- `request.paymentConfirmDeclined` is a **side-channel flag** consumed by the rate limiter's `requestWasSuccessful` predicate (`rate-limits.ts`). It is not part of the response; removing it silently breaks decline-budget accounting.
- In-flight results are deliberately counted under their own `in_flight` label rather than being grouped with `succeeded` or `declined` — a spike in challenges is a different incident from a spike in declines.
- The success path makes a **second service call** (`presentWithActions`) to attach provider-specific `actions` to the returned payment. Skipping it would omit the "finish at provider" step from the form's state.
- The body schema (`ConfirmPaymentBody`) comes from `@api/schemas.zod`, not from the payments module itself.
