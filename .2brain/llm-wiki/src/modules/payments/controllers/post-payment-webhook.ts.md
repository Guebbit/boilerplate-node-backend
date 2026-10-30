---
source: src/modules/payments/controllers/post-payment-webhook.ts
sha256: ea1487ba17f8297b1c48923789bbb6e6fe91ae5726e85731df38a20a33c2f699
generated_at: 2026-10-29T05:04:13.277639+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-webhook.ts

## Purpose

Single HTTP handler for `POST /payments/webhook/:provider`. Receives provider-originated payment event deliveries, verifies the request via the provider's own signature (no session auth), and delegates the parsed event to the payment service. It exists to be the one place where the "browser's word" is replaced by a cryptographically signed raw body as the sole authority for what happened to a payment.

## Key elements

- **`postPaymentWebhook(request, response)`** — the sole export. Reads `request.rawBody` (a buffer preserved by an `express.json` `verify` hook), resolves the adapter from the registry by `request.params.provider`, calls `provider.parseWebhook(rawBody, headers)` to verify the signature and decode the event, then hands the event to `paymentService.applyWebhookDelivery(event, provider.name)`.
- **Success path** — responds via `noContentResponse` (a 2xx with no body), signalling to the provider that the delivery was accepted regardless of whether the event was acted upon.
- **`WebhookRejected` catch** — any of the provider's rejection reasons (bad signature, timestamp drift, malformed JSON, missing event id) yields a 400 with a localized message. If `error.signatureFailure` is set, a security event is additionally recorded.
- **404 path** — provider name in the path does not match any registered adapter.
- **500 path** — all other errors are forwarded to `catchAs`, letting the provider retry on the next delivery.

## Relationships

- **`providers/registry.ts`** — `paymentProviderRegistry.resolve(name)` maps the `:provider` path segment to a concrete adapter instance.
- **`providers/index.ts`** — source of the `WebhookRejected` error class used to distinguish provider-side rejections from internal faults.
- **`services/index.ts`** — `paymentService.applyWebhookDelivery` performs the idempotent (conditional-write) state change; this controller never writes payment state directly.
- **`routes.ts`** — registers this handler on the `POST /payments/webhook/:provider` route.
- **`http/response.ts`** — provides `noContentResponse` and `rejectResponse` for the three response shapes.
- **`http/controller.ts`** — `catchAs` centralises the 500 response and logging for unexpected errors.
- **`http/request.ts`** — `callerContextOf(request)` extracts the caller's identifying fields for the security-event record.
- **`observability/security-events.ts`** — `recordSecurityEvent` is called only when a *signature* specifically fails (not for provider-side malformed payloads).
- **`payments/audit.ts`** — supplies the `paymentsAuditActions.SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` action constant.
- **`i18n/index.ts`** — `t()` localises the user-facing error strings in 400/404 responses.
- **`adapters/logger.ts`** — logs the fatal missing-`rawBody` case (error level) and every `WebhookRejected` (warn level).

## Notes

- **Raw body is mandatory.** The `express.json` `verify` hook (configured in `app/security.ts`) preserves the buffer *for this route only*. If the parser ordering is ever changed so `rawBody` is absent, every delivery will 400 — this is detected and logged as a system error, not a client error.
- **No session/cookie auth by design.** The only credential is the provider's signature over the exact raw bytes. Adding a second auth layer would break deliveries.
- **Idempotency lives in the service, not here.** The controller applies the event exactly once per HTTP call; the service layer uses conditional writes so that a provider's redelivery settles nothing twice.
- **Provider is chosen by path, not by env var.** A provider that is no longer the default for new checkouts still resolves its in-flight webhook deliveries through its own adapter.
- **Security events are selective.** Only a failed *signature verification* is recorded as a security event. A provider sending a structurally malformed body (bad JSON, missing id) is logged at warn level but not flagged as an attack.
- **`Stryker disable` comments** suppress mutation testing on the defensive missing-`rawBody` branch and the warn-log line, where mutants are intentionally unkillable.
