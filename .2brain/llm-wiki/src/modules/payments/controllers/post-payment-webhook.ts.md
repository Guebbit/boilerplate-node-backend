---
source: src/modules/payments/controllers/post-payment-webhook.ts
generated_at: 2026-11-22T06:42:52.862812+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/controllers/post-payment-webhook.ts

## Purpose
Express controller for `POST /payments/webhook/:provider`, the endpoint where a payment provider reports what actually happened to a payment. It is the authority for payment outcomes. It uses no session auth: the provider authenticates by signing the raw request body, and the signature is verified downstream. Rejections and errors are mapped to HTTP statuses so that provider retries behave correctly.

## Key elements
- `postPaymentWebhook(request, response)` — the exported handler.
  - Reads `rawBody` and `headers` from the request.
  - Calls `paymentService.receiveWebhook(provider, rawBody, headers)`, where `provider` comes from `request.params.provider`.
  - Responds 204 on success.
- `sentNoBody(headers)` — private helper. It is true when there is no `Transfer-Encoding` and `Content-Length` is absent or `'0'`. It separates a caller sending an empty request from a parser-ordering bug.

Response mapping:

| Condition | Result |
|---|---|
| No `rawBody` | 400 with `payments.webhook-unverified`. If a body was announced, an error is also logged. |
| `WebhookProviderUnknownError` | 404 with `payments.webhook-not-configured` |
| `WebhookRejected` | 400 with `payments.webhook-unverified` (details below) |
| Anything else | Delegated to `catchAs(response, 'postPaymentWebhook')`, which yields a 500 so the provider retries |

For `WebhookRejected`:
- `error.message` is logged as a warning.
- If `error.signatureFailure` is true, a security event is recorded with the action `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` and the reason.
- Otherwise `paymentWebhookDroppedTotal` is incremented with `reason: 'unreadable'`.

## Relationships
- `src/modules/payments/services/index.ts` — supplies `paymentService` and `WebhookProviderUnknownError`. The service applies the event idempotently through conditional writes.
- `src/modules/payments/providers/index.ts` — supplies `WebhookRejected`. Each adapter verifies its own signature.
- `src/modules/payments/providers/webhook-signature.ts` — related to the signature verification that happens downstream of this controller.
- `src/modules/payments/audit.ts` — supplies `paymentsAuditActions`, used for the security event action.
- `src/modules/payments/metrics.ts` — supplies `paymentWebhookDroppedTotal`, which feeds the `PaymentWebhookUnreadable` alert.
- `src/infrastructure/observability/security-events.ts` — `recordSecurityEvent`, called with `callerContextOf(request)` from `src/infrastructure/http/request.ts`.
- `src/infrastructure/http/response.ts` — `noContentResponse` and `rejectResponse`.
- `src/infrastructure/http/controller.ts` — `catchAs`, for unexpected errors.
- `src/infrastructure/adapters/logger.ts` — error and warning logs.
- `src/infrastructure/i18n/index.ts` — `t()` for the error messages.
- `src/modules/payments/routes.ts` — mounts the handler.
- `src/modules/payments/tests/integration/webhook-no-body.test.ts` — covers the empty-body case.

## Notes
- The provider is chosen by the name in the URL path from the registry of installed adapters, never from `NODE_PAYMENT_PROVIDER`. A provider that is no longer the default can still deliver events for in-flight payments.
- Authentic events get a 204, including events this module ignores, because a non-2xx makes the provider retry harder.
- Only unverifiable or unreadable bodies get a 400. Genuine faults deliberately become 500s so that retries happen.
- The signature must be checked against the raw bytes, never a re-serialised body.
- The raw body buffer is kept for this route alone by the `verify` hook of `express.json`, set up in `app/security.ts`.
- The `Stryker disable` comments exclude the log calls from mutation testing.
- A signed but malformed event is counted as dropped, not recorded as a security event. No sweep re-reads dropped events, so the metric exists to alert staff.
