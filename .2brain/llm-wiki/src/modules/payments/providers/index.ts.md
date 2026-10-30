---
source: src/modules/payments/providers/index.ts
sha256: 84a1b871587ee60d58516506c4809db8200684f178d8dbef96ba1f9180183df7
generated_at: 2026-10-29T05:08:03.554542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/index.ts

## Purpose

This file defines the **payment provider port** — the contract every real PSP adapter must satisfy. It exists as a single, stable seam so that the rest of the codebase (controllers, settlement, sweep) never names a specific provider. No provider is shipped in the boilerplate; a live project plugs one in by writing one adapter file and one `registerPaymentProvider` call. The `fake` double used in dev/demo/tests lives under `scenarios/support/doubles/` and is registered before the app boots.

## Key elements

- **`PaymentProvider`** (interface) — the full adapter contract: `prepare`, `confirm`, `retrieve`, `refund`, `retrieveRefund`, `listRefunds`, `listDisputes`, `parseWebhook`, `close`. Each method's JSDoc documents idempotency, error-class, and security requirements (signature verification, no card numbers, no trusted browser status).
- **`ProviderPaymentStatus`** (union) — `open | requires_action | processing | succeeded | declined`. Provider-owned states only; `cancelled` and refund states belong to the application.
- **`ProviderPaymentState`** — what a provider reports for one intent (status, `cardLast4`, `amountReceived`, `currency`, `paymentId`). Used by `confirm`, `retrieve`, and webhook settlement.
- **`PreparedPayment`** — return of `prepare`: `providerRef` (persisted) and `clientSecret` (hand-to-browser, never persisted).
- **`RefundedByProvider` / `ProviderRefundState` / `ProviderRefund`** — refund shapes: the immediate answer, the re-readable status, and the full listing entry (amount, currency, `createdAt`).
- **`ProviderDisputeState`** — type alias for `DisputeReport`; disputes carry their own state because some providers (Adyen) have no re-read endpoint.
- **`ProviderWebhookEvent`** — deliberately thin normalised delivery: `id`, `providerRef?`, `refundRef?`, `dispute?`. Outcome is always re-read via `retrieve`; only disputes embed state.
- **Re-exports** — `registerPaymentProvider` (from `./registry`), `PaymentInFlightError` / `PaymentProviderError` (from `./errors`), `signWebhookPayload` / `verifyWebhookSignature` / `WEBHOOK_SIGNATURE_HEADER` / `WebhookRejected` (from `./webhook-signature`). Consumers import everything from this one module.

## Relationships

- **`src/modules/payments/providers/registry.ts`** — owns `paymentProviderRegistry` and `registerPaymentProvider`; this file re-exports the register function and imports the registry internally.
- **`src/modules/payments/providers/errors.ts`** — declares `PaymentInFlightError` and `PaymentProviderError`; re-exported here so controllers and services import from a single path.
- **`src/modules/payments/providers/webhook-signature.ts`** — implements HMAC verification helpers and the `WebhookRejected` error; re-exported here.
- **`src/infrastructure/runtime/provider-registry.ts`** — provides `requireProvider`, the lookup mechanism that resolves the registered adapter at runtime via `NODE_PAYMENT_PROVIDER`.
- **`src/infrastructure/config/define.ts`** — provides `defineProbe`, used to wire the provider config probe into the app.
- **`src/modules/payments/config.ts`** — supplies `paymentsConfig` (provider name, limits) consumed by the registry and controllers.
- **`scenarios/support/doubles/payments/fake.ts`** — the in-process `PaymentProvider` double; implements this exact interface and is registered via `register.ts` before the app loads.
- **`scenarios/support/doubles/payments/register.ts`** — calls `registerPaymentProvider` with the fake so dev/demo/test paths never hit a network.
- **`src/modules/payments/controllers/post-payment-refund*.ts`** — consume `refund`, `retrieveRefund`, and the error types defined here to drive refund flows.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — calls `parseWebhook` and then `retrieve`/`retrieveRefund` per the thin-event contract.
- **`src/modules/payments/domain/display-status.ts`** — maps `ProviderPaymentStatus` values to user-facing display statuses.
- **`src/modules/payments/services/deadline.ts`** — the refund sweep that calls `retrieveRefund` and `listRefunds` within the lease window described in the interface JSDoc.
- **`src/modules/payments/module.ts`** — wires the module together: config, registry, controllers, and services around this port.

## Notes

- **No provider is bundled.** The file defines only types and re-exports; there is zero provider logic here. A missing registration throws at the `requireProvider` call site, not at import time.
- **`clientSecret` is never persisted or logged.** It authorises the browser to complete the payment directly at the provider; treating it as a credential is a hard requirement stated in the interface JSDoc.
- **Webhook events are intentionally thin.** The body of a delivery is never trusted for the outcome; settlement always re-reads state from the provider. The sole exception is disputes, which carry their own state because some providers (Adyen) offer no re-read endpoint.
- **Refund idempotency is two-layered.** The provider-side idempotency key protects against concurrent retries at the provider; the application-side conditional write on `amountRefunded` protects against concurrent callers that never reach the provider simultaneously. Beyond the key window (≈24 h on Stripe), the adapter must self-idempotent via `metadata.refund_record` + refund listing.
- **Error taxonomy matters.** `PaymentProviderError` carries a closed `code` that distinguishes `provider_unavailable`, `disputed`, and definite failures. The two unclear classes (`provider_unavailable`, `unknown`) are never offered for manual settlement because the refund may have gone through.
