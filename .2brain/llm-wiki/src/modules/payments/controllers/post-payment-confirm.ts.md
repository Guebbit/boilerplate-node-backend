---
source: src/modules/payments/controllers/post-payment-confirm.ts
sha256: 0a3e520ea908c7ae821325a278f7e509afcd07de1b6fc4bc20e9b0d3da932fc8
generated_at: 2026-09-23T19:17:06.854223+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-confirm.ts

## Purpose

Handler for `POST /payments/:id/confirm` — the final step where the browser submits its tokenised payment-method reference. This is where the payment outcome is resolved (succeeded, declined, or in-flight) and the corresponding events, metrics, and audit trail are produced.

## Key elements

- **`postPaymentConfirm(request, response)`** — the sole export. Parses the body against `ConfirmPaymentBody` (Zod), delegates to `paymentService.confirmPayment`, then branches on the result:
  - **Decline detection** — sets `request.paymentConfirmDeclined = true` when the error code is `PAYMENT_DECLINED`; consumed downstream by the decline-budget rate limiter (`requestWasSuccessful` in `rate-limits.ts`).
  - **Metrics** — increments `paymentConfirmTotal` with one of three labels: `succeeded`, `in_flight` (e.g. `requires_action`, `processing`), or `declined`. Not-found / race rejections are deliberately excluded.
  - **HTTP response** — `refused()` returns 409 for declines and other refusals; `successResponse()` returns 200 for both true success and in-flight states (a 4xx would tell the browser to stop).
  - **Error path** — `.catch(catchAs(response, 'postPaymentConfirm'))`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Provides `parseBody`, `refused`, `catchAs` — the standard request-validation, refusal, and error-catch helpers. |
| `src/infrastructure/http/request.ts` | Provides `callerContextOf`, extracted and passed into `confirmPayment` for audit. |
| `src/infrastructure/http/response.ts` | Provides `successResponse`, used for the 200 path. |
| `src/modules/payments/metrics.ts` | Exports `paymentConfirmTotal`, the Prometheus counter incremented per outcome. |
| `src/modules/payments/routes.ts` | Wires this handler onto the `POST /payments/:id/confirm` route (consumes `postPaymentConfirm`). |
| `src/modules/payments/services/index.ts` | Exports `paymentService.confirmPayment`, the domain logic this controller delegates to. |
| `src/types/index.ts` | Provides the `Payment` type used for the response payload. |

## Notes

- **In-flight is a 200, not a 4xx.** `requires_action` and `processing` mean the browser has a next step (3-D Secure redirect, issuer processing). Returning a client-error status would cause the SPA to abort the flow.
- **Decline ≠ refusal in the rate-limiter's eyes.** The `request.paymentConfirmDeclined` flag lets the limiter spend its decline budget only on genuine card declines, not on the route's other 409 (e.g. wrong state transition).
- **Metric label hygiene.** In-flight is tracked as its own label so that a challenge spike (3DS) is distinguishable from a decline spike (issuer fraud rules) in dashboards.
- **`.toJSON()` on the model** performs the `_id` → `id` rename and date → ISO-string serialization before the payload reaches the client.
