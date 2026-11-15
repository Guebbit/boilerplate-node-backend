---
source: src/modules/payments/controllers/post-payment-webhook.ts
sha256: 7fc445ba1ac973fb77c8ab6f3bec6ad71059f248ba8613eb61742fff07128d1c
generated_at: 2026-11-14T20:59:27.087586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-webhook.ts

## Purpose

Single HTTP handler for `POST /payments/webhook/:provider`. Receives payment-event deliveries from external providers, validates the raw-body signature via the service layer, and applies the event idempotently. It is the only place in the codebase that turns a provider's signed HTTP POST into a state change.

## Key elements

- **`postPaymentWebhook(request, response)`** (exported) — The sole handler. Reads `request.rawBody` (populated by an Express `verify` hook), delegates to the payment service's `receiveWebhook` method, and maps the result or thrown error to an HTTP status.
- **`sentNoBody(headers)`** (internal) — Checks whether the request carried no body at all (no `Transfer-Encoding`, `Content-Length` absent or `0`). Used to distinguish a caller's empty request (plain 400, no alarm) from a body that *was* sent but failed to buffer (logged as an infrastructure error).
- **Error dispatch (`.catch` block):**
  - `WebhookProviderUnknownError` → **404** (`t('payments.webhook-not-configured')`).
  - `WebhookRejected` → **400** (`t('payments.webhook-unverified')`). The error's `message` carries the specific reason; its `signatureFailure` flag additionally triggers a security-event record.
  - Anything else → **500** via `catchAs`, so the provider retries.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/payments/services/index.ts` | The payment service is called here (`receiveWebhook`); all signature verification, provider resolution, and idempotent application are delegated to that module. |
| `src/modules/payments/services/errors.ts` | Defines `WebhookProviderUnknownError`, which this controller catches to return 404. |
| `src/modules/payments/providers/index.ts` | Source of the `WebhookRejected` error class; this controller catches it, inspects its `signatureFailure` flag, and returns 400. |
| `src/modules/payments/providers/webhook-signature.ts` | Signature verification logic lives in this module; this file never performs crypto directly. |
| `src/modules/payments/routes.ts` | Registers this handler on the `POST /payments/webhook/:provider` route. |
| `src/modules/payments/audit.ts` | Provides the audit-action constant used when recording a security event for an invalid signature. |
| `src/infrastructure/observability/security-events.ts` | Provides `recordSecurityEvent`, called only when a `WebhookRejected` error carries the `signatureFailure` flag. |
| `src/infrastructure/http/controller.ts` | Provides `catchAs` to format the 500 response. |
| `src/infrastructure/http/request.ts` | Provides `callerContextOf` to extract caller metadata attached to a security event. |
| `src/infrastructure/http/response.ts` | Provides `noContentResponse` (204) and `rejectResponse` (400 / 404). |
| `src/infrastructure/i18n/index.ts` | Provides `t()` for the two localised error strings. |
| `src/infrastructure/adapters/logger.ts` | Used to log the missing-raw-body infrastructure error and rejected-webhook warnings. |
| `src/modules/payments/tests/integration/webhook-no-body.test.ts` | Integration test exercising the no-body / empty-body 400 path. |
| `src/modules/payments/tests/integration/webhook-rate-limit.test.ts` | Integration test for rate-limiting behaviour on this endpoint. |

## Notes

- **Raw body is load-bearing.** The Express `json` middleware's `verify` hook (configured in `app/security.ts`) stashes the raw buffer on `request.rawBody` for this route only. If that ordering is changed, every signature check silently fails — the controller logs an explicit error in that case, but the caller still receives a 400.
- **204, not 200, for success.** Any authentic event — including ones this module deliberately ignores — gets `204 No Content`. A non-2xx tells the provider the delivery failed and triggers a retry.
- **400 vs 500 is deliberate.** 400 means "your signature/body is wrong, stop retrying." 500 means "our transient fault, please retry." Mapping a genuine internal error to 400 would suppress a needed retry.
- **Provider is taken from the URL path**, never from an environment variable. A de-provisioned provider can still deliver in-flight events; each adapter verifies its own signature scheme. An unrecognised name gets a clean 404.
- **Security events ≠ all rejections.** The security-event record fires only when the `WebhookRejected` error has its `signatureFailure` flag set. A provider sending a malformed JSON body or a missing event-id is logged at warn level but is not treated as an attack.
- **Idempotency is the service's job.** The controller applies no locking or deduplication itself; the payment service guarantees "applied once" via conditional writes.
