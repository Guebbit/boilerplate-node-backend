---
source: src/modules/payments/providers/index.ts
sha256: 890d92e9b7506ce76a134885dcc52e185042c24ec610c0d313960e82af84baee
generated_at: 2026-11-08T07:23:32.967793+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/index.ts

## Purpose

This file is the **payment provider port** — the single interface a real PSP (Stripe, Adyen, …) must implement, plus every supporting type the rest of the payments module consumes. It exists so that no concrete provider is shipped: the boilerplate contains zero card-payment code, and a live project plugs in by adding one adapter file and one `registerPaymentProvider` call. The file is the canonical place to see *what a provider must answer*, without reading any specific adapter.

## Key elements

- **`PaymentProvider`** — the interface every adapter implements. Methods: `name`, `prepare`, `confirm`, `retrieve`, `refund`, `parseWebhook` (truncated in the listing but referenced throughout the JSDoc).
- **`ProviderPaymentStatus`** — closed union: `open | requires_action | processing | succeeded | declined`. `canceled` and refund state are intentionally *not* here; they belong to this application, not the provider.
- **`ProviderPaymentState`** — one answer about an intent: status, optional `cardLast4`, `amountReceived` (decimal string), `currency`, and `paymentId` echo.
- **`PreparedPayment`** — returned by `prepare`: `providerRef` (persisted) and `clientSecret` (browser-only, never stored).
- **`RefundedByProvider`** / **`ProviderRefundState`** / **`ProviderRefund`** — the three shapes a refund can take at the provider (immediate answer, later state, full listing row).
- **`ProviderWebhookEvent`** — the *thin* normalised webhook: `id`, optional `providerRef`, optional `refundRef`, optional `dispute`. The body is never trusted for the outcome; settlement re-reads via `retrieve`.
- **`ProviderDisputeState`** — alias for `DisputeReport`; carries its own state because some PSPs (Adyen) have no re-read endpoint.
- **`registerPaymentProvider`** — re-exported from `./registry`; the single call a deployment makes to bind an implementation.
- **`PaymentInFlightError`, `PaymentProviderError`** — re-exported from `./errors`.
- **`signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER`, `WebhookRejected`** — re-exported from `./webhook-signature`.

## Relationships

- **`./registry`** — `index.ts` re-exports `registerPaymentProvider` and imports `paymentProviderRegistry`; the registry is where the `NODE_PAYMENT_PROVIDER` environment key is resolved at runtime.
- **`./errors`** — `index.ts` re-exports the two error classes so callers have a single import surface.
- **`./webhook-signature`** — `index.ts` re-exports the HMAC/signature helpers; `parseWebhook` on the provider interface is expected to call `verifyWebhookSignature` before trusting a body.
- **`@infrastructure/runtime/provider-registry`** — provides `requireProvider`, the generic lookup that the module's controllers use to fetch the active `PaymentProvider` instance by name.
- **`@infrastructure/config/define`** — provides `defineProbe`, used to gate the provider behind a config probe.
- **`../config`** — provides `paymentsConfig` (e.g. provider name, timeouts) read at wiring time.
- **`scenarios/support/doubles/payments/fake.ts`** — implements `PaymentProvider` as an in-process double for dev, demo, and tests.
- **`scenarios/support/doubles/payments/register.ts`** — calls `registerPaymentProvider` with the fake before the application boots.
- **`src/modules/payments/controllers/post-payment-refund.ts`, `post-payment-refund-cancel.ts`, `post-payment-refund-settle.ts`** — consume `PaymentProvider.refund`, `RefundedByProvider`, and `ProviderRefundState` to drive refund creation, cancellation, and sweep.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — calls `parseWebhook` / `ProviderWebhookEvent`, then re-reads via `retrieve` or `retrieveRefund` before writing.
- **`src/modules/payments/domain/display-status.ts`** — maps `ProviderPaymentStatus` (and refund state) onto the application's public status vocabulary.
- **`src/modules/payments/services/deadline.ts`** — provides the lease/deadline mechanism the refund sweep relies on; the `refund` JSDoc references the 10-minute sweep window that `deadline` enforces.
- **`src/modules/payments/module.ts`** — wires the provider registry, config, and controllers together; the single place `registerPaymentProvider` is invoked in production.

## Notes

- **`open` means "intent exists, nothing attempted yet."** Settlement must write *nothing* for this status; do not treat it as an error.
- **`amountReceived` is a decimal string, not an integer.** A real adapter converts minor units (cents) to this format. Settlement compares it against the frozen amount; a `succeeded` without it is a mismatch.
- **`clientSecret` is the one field that must never be persisted, logged, or audited.** It authorises completing the payment in the browser.
- **Webhook events are deliberately thin.** The body names *which* intent/refund it concerns but carries no authoritative status (disputes are the exception). Always re-read via `retrieve`/`retrieveRefund` before writing.
- **Idempotency of `refund` is two-layered.** The provider-side key (`refund:{paymentId}:{refundId}`) protects concurrent retries; the application-side conditional write on `amountRefunded` protects the sequential case. After the provider's key window expires (e.g. Stripe: 24 h), the adapter must fall back to listing refunds and adopting one by `metadata.refund_record`.
- **`cardLast4` is the only card-derived data this server may store.** Receiving a full PAN means the adapter is in the wrong PCI scope.
- **The file re-exports rather than re-declares** `PaymentProviderError`, the webhook helpers, and `registerPaymentProvider`. Canonical definitions live in `./errors`, `./webhook-signature`, and `./registry` respectively; edit those, not this barrel.
