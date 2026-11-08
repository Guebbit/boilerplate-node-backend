---
source: src/modules/payments/controllers/post-payment-webhook.ts
sha256: ea1487ba17f8297b1c48923789bbb6e6fe91ae5726e85731df38a20a33c2f699
generated_at: 2026-11-08T07:19:06.351488+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-webhook.ts

## Purpose

Handles `POST /payments/webhook/:provider`. It receives payment-status callbacks from external providers, verifies the signature (delegated to the provider adapter), and hands the parsed event to the payment service for a single idempotent apply. It deliberately uses no session authentication; the raw-body signature is the sole credential.

## Key elements

- **`postPaymentWebhook(request, response)`** – The single export. Resolves the provider from the path param, calls `provider.parseWebhook(rawBody, headers)`, then `paymentService.applyWebhookDelivery(event, provider.name)`. Returns **204** on success, **404** for an unregistered provider name, **400** for a `WebhookRejected` error, or **500** for any unexpected fault (so the provider retries).
- **`rawBody` guard** – If `request.rawBody` is absent (parser-ordering regression), the handler short-circuits with a 400 and an error log.
- **Security-event recording** – When a `WebhookRejected` carries `signatureFailure === true`, `recordSecurityEvent` is called with `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE`; other rejection reasons (malformed JSON, missing event id, timestamp drift) are logged but not flagged as attacks.

## Relationships

- **`@infrastructure/http/response`** – `noContentResponse` (204 success) and `rejectResponse` (400/404 error bodies).
- **`@infrastructure/http/controller`** – `catchAs` wraps unexpected errors into a 500 with structured logging.
- **`@infrastructure/http/request`** – `callerContextOf` extracts IP/user-agent for the security-event record.
- **`@infrastructure/observability/security-events`** – `recordSecurityEvent` emits an audit trail entry on signature-failure rejections.
- **`@infrastructure/adapters/logger`** – Structured error/warn logs for the no-raw-body case and for `WebhookRejected` rejections.
- **`@infrastructure/i18n`** – `t()` localises the two user-facing error headlines (`payments.webhook-unverified`, `payments.webhook-not-configured`).
- **`../providers/registry`** – `paymentProviderRegistry.resolve(name)` maps the `:provider` path param to an installed adapter.
- **`../providers` (index)** – Exports the `WebhookRejected` error class used for the 400 branch.
- **`../services`** – `paymentService.applyWebhookDelivery` performs the idempotent state transition.
- **`../audit`** – Provides the `paymentsAuditActions` enum values consumed by the security-event call.
- **`../routes`** – Mounts this handler at `POST /payments/webhook/:provider`.

## Notes

- The raw body is captured by Express's `json` `verify` hook (configured in `app/security.ts`), **not** by this file. If that ordering is broken, every webhook 400s with a misleading "unverified" message; the guard here only detects the symptom.
- Signature verification itself lives inside each provider adapter's `parseWebhook` method (see `providers/webhook-signature.ts`); this controller never inspects the signature.
- A non-2xx response triggers provider-side retries. The only intentional 400 is a genuinely unverifiable body; all other failures are left as 500 so retries are semantically correct.
- `error.message` on `WebhookRejected` is the human-readable reason (e.g. "Signature timestamp outside tolerance") and is logged verbatim rather than replaced with a fixed string.
