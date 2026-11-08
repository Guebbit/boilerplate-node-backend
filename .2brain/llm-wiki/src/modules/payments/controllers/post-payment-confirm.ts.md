---
source: src/modules/payments/controllers/post-payment-confirm.ts
sha256: c007e5a509bb448beb402e1536bdc6ffa4873fcefbab220e631f341c4fcb9d63
generated_at: 2026-11-08T07:18:04.971160+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-confirm.ts

## Purpose

Handles `POST /payments/:id/confirm` — the step where the browser hands over the tokenised payment method and the service fires the actual charge events. It normalises three distinct outcomes (succeeded, declined, in-flight) into appropriate HTTP responses and records a Prometheus counter for each.

## Key elements

- **`postPaymentConfirm`** (exported const) — The sole handler. Validates the `:id` param and the JSON body against `ConfirmPaymentBody`, delegates to `paymentService.confirmPayment`, then branches on the result to emit metrics, set a decline flag on the request, and either refuse (409) or resolve `presentWithActions` before returning 200.
- **`request.paymentConfirmDeclined`** (side-effect on the Express request) — A boolean flag consumed downstream by the decline-budget limiter in `rate-limiters.ts` so it spends budget only on genuine card declines, not on other 409 responses from this route.
- **Metric labels** — `paymentConfirmTotal` is incremented with one of three outcomes: `succeeded`, `in_flight` (covers `requires_action` / `processing`), or `declined`. Not-found and race rejections are intentionally *not* counted.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the shared helpers `requireId`, `parseBody`, `refused`, and `catchAs` that structure validation, error mapping, and catch-all handling.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` to extract and validate the `:id` param before any business logic runs.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which derives the caller identity passed into `confirmPayment`.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, used to emit the final 200 with a `Payment` payload.
- **`src/modules/payments/metrics.ts`** — Source of `paymentConfirmTotal` (a Counter) that this handler increments per outcome.
- **`src/modules/payments/services/index.ts`** — Exposes `paymentService`, whose `confirmPayment` and `presentWithActions` methods contain the actual business logic.
- **`src/modules/payments/routes.ts`** — Wires this handler to the `POST /payments/:id/confirm` route.
- **`src/types/index.ts`** — Source of the `Payment` type used in the success-response generic.

## Notes

- A **declined** payment is returned as a **409** with `PAYMENT_DECLINED`, not a 4xx "stop" signal to the browser. An **in-flight** answer (`requires_action`, `processing`) is a **200** — the browser still has a next step (e.g. redirect to provider). A 4xx would incorrectly tell it to halt.
- The `actions` field on the response is loaded via a second call (`presentWithActions`) *after* the confirm result; omitting it would hide the follow-up step from the payment form.
- The `request.paymentConfirmDeclined` flag is a deliberate cross-cutting convention: the rate-limiter in `rate-limiters.ts` reads it to distinguish a real decline from other 409s this route might produce.
- The handler is a plain function (not a class method), consistent with the controller helpers in `@infrastructure/http/controller`.
