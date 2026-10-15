---
source: src/modules/payments/controllers/post-payment-webhook.ts
sha256: 013110f004111fda0dd19129d8f130530ae6bd67b5f042c3dcaf70b2e9ed748b
generated_at: 2026-10-15T11:24:43.001326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-webhook.ts

## Purpose

Handles `POST /payments/webhook`: receives a signed event from the payment provider confirming what happened to a payment, verifies the signature against the raw body, and delegates processing to the payment service. It is the sole entry point for provider-originated state changes — no session, no cookie, just a cryptographically signed raw byte string.

## Key elements

- **`postPaymentWebhook(request, response)`** — the exported Express handler. Resolves the configured provider, calls `provider.parseWebhook(rawBody, signatureHeader)` to verify + parse, then calls `paymentService.applyWebhookDelivery(event)`. Returns `200` for any authentic event (including ones this module ignores), `400` for an unverifiable signature, `404` when no provider is configured, and `500` (via `catchAs`) for internal faults so the provider retries.
- **`WebhookRejected`** (imported from `../providers`) — error thrown by the provider's parser on any verification failure. Carries `.message` (specific reason) and `.signatureFailure` (boolean flag distinguishing a likely attack from a provider-side malformed event).
- **`WEBHOOK_SIGNATURE_HEADER`** — constant naming the header the provider signs into the request.

## Relationships

- **`../providers` (index / webhook-signature)** — supplies `resolvePaymentProvider` (async factory), `WebhookRejected`, and `WEBHOOK_SIGNATURE_HEADER`. The provider's `parseWebhook` performs the actual signature check and JSON parse.
- **`../services` (index)** — `paymentService.applyWebhookDelivery(event)` is the sole downstream call; deduplication by event id and state transitions live there.
- **`../routes.ts`** — registers this handler on `POST /payments/webhook`.
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` shape the HTTP reply.
- **`@infrastructure/http/controller`** — `catchAs` wraps unhandled errors into a `500` with structured logging.
- **`@infrastructure/http/request`** — `callerContextOf` extracts IP/user-agent metadata for the security event.
- **`@infrastructure/observability/security-events`** — `recordSecurityEvent` fires only when `WebhookRejected.signatureFailure` is true.
- **`@infrastructure/observability/audit`** — `coreAuditActions.SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` identifies the audit action.
- **`@infrastructure/adapters/logger`** — logs the missing-`rawBody` error and every rejection.
- **`@infrastructure/i18n`** — `t('payments.webhook-…')` localises the user-facing message strings in `200`/`400`/`404` responses.

## Notes

- **`rawBody` is load-bearing.** It is populated by the `verify` hook passed to `express.json` in `app/security.ts`. If that ordering is ever broken, every webhook silently fails signature verification. The controller guards for it but can only return a generic `400`.
- **200 means "got it", not "processed it".** The provider treats any non-2xx as a failed delivery and retries. Even events this service ignores must still produce a 200.
- **Security-event vs. log line.** Only `WebhookRejected` instances with `.signatureFailure === true` are recorded as security events. A provider sending malformed JSON or a missing event id is logged but not escalated — it is a provider fault, not an attack.
- **Stryker annotations** (`Stryker disable … all`) suppress mutation testing on dead-defensive branches (the `!rawBody` guard and the rejection warn log).
- **No body re-serialisation.** The handler passes the `Buffer` (`rawBody`) directly to the parser; never substitute a parsed-then-re-serialised object, or the signature check will fail.
