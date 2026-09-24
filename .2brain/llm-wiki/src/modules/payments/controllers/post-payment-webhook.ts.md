---
source: src/modules/payments/controllers/post-payment-webhook.ts
sha256: 2b350ca7ae003a3e559fa7d02372ae724b25c2036e2a8201454b2947291da116
generated_at: 2026-09-23T19:17:55.876206+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-webhook.ts

## Purpose

Express controller for `POST /payments/webhook`. Receives payment-event notifications from an external provider, verifies the raw-body signature (no session auth), delegates the validated event to the payment service, and responds with 200 or 400. It exists to be the single, deliberately minimal entry point through which a payment provider's word becomes actionable in this system.

## Key elements

- **`postPaymentWebhook(request, response)`** – The sole export. Reads `request.rawBody` (a Buffer preserved by a custom `express.json` `verify` hook), calls the provider to parse and verify the webhook, hands the resulting event to `paymentService.applyWebhookDelivery`, and returns either a 200 success, a 400 rejection (bad signature, malformed body, missing event id), or a 500 via `catchAs` for unexpected internal errors.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/payments/providers/index.ts` | Imports `resolvePaymentProvider` (to obtain the active provider and call `parseWebhook`), the `WebhookRejected` error class, and the `WEBHOOK_SIGNATURE_HEADER` constant. |
| `src/modules/payments/providers/webhook-signature.ts` | Indirect dependency through the providers index; the actual signature verification logic lives there. |
| `src/modules/payments/services/index.ts` | Imports `paymentService` and calls `applyWebhookDelivery(event)` after successful parsing. |
| `src/modules/payments/routes.ts` | Registers `postPaymentWebhook` as the handler for `POST /payments/webhook`. |
| `src/infrastructure/http/response.ts` | Uses `successResponse` and `rejectResponse` to shape the HTTP reply. |
| `src/infrastructure/http/controller.ts` | Uses `catchAs` to convert unexpected errors into a 500 response. |
| `src/infrastructure/adapters/logger.ts` | Logs an `error` when `rawBody` is missing and a `warn` when the provider rejects the webhook. |
| `src/infrastructure/i18n/index.ts` / `context.ts` | Uses `t()` for user-facing error/success message keys (`payments.webhook-unverified`, `payments.webhook-accepted`). |

## Notes

- **`rawBody` is a hard precondition.** The `verify` hook on `express.json` (configured in `app/security.ts`) attaches the original Buffer to `request.rawBody` for this route only. If the parser ordering is changed, every signature check fails; the controller guards against this with an early 400 and an `error` log.
- **200 means "delivered," not "applied."** Any authentic event—regardless of whether this module acts on it—gets a 200. A non-2xx triggers provider retries, so the contract is: 400 only for unverifiable input, 500 only for genuine internal faults (which *should* be retried).
- **`WebhookRejected.message` is the log detail.** The controller logs `error.message` verbatim rather than a fixed string, because the message already encodes the specific failure reason (bad header, timestamp drift, mismatch, invalid JSON, missing id).
- **Stryker mut-testing disables** wrap the `rawBody`-missing branch and the `WebhookRejected` log line to suppress intentional "dead" mutations in those defensive paths.
