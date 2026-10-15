---
source: src/modules/payments/providers/index.ts
sha256: e6e12aefd9a5d88c63f4a1e75c9437ef120c2f3be30d8b29748ad9c126aababb
generated_at: 2026-10-15T11:27:34.544988+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/index.ts

## Purpose

Defines the **payment-provider port** — the interface (`PaymentProvider`) that any real payment service provider must implement, plus the shared types that describe what a provider reports (payment state, webhook events, prepared payments, refunds). It also exposes two resolvers that look up a registered implementation by name. The file contains **no implementation**; the boilerplate ships zero providers, and a live deployment plugs one in via `registerPaymentProvider`.

## Key elements

- **`PaymentProvider`** (interface) — the contract: `prepare`, `confirm`, `retrieve`, `refund`, `cancel`, `parseWebhook`, and a `name` field. A real PSP adapter implements all of these.
- **`ProviderPaymentStatus`** (type) — `'requires_action' | 'processing' | 'succeeded' | 'declined'`. `cancelled` and refund states are application-level, not provider-level.
- **`ProviderPaymentState`** (interface) — what the provider reports for one intent: status, optional `cardLast4`, `amountReceived`, `currency`, and `paymentId` (echoed back to tie the money to the correct row).
- **`PreparedPayment`** (interface) — return value of `prepare`: the provider's intent reference (`providerRef`) and an ephemeral `clientSecret` for the browser (never persisted).
- **`RefundedByProvider`** (interface) — the provider's refund id (`refundRef`).
- **`ProviderWebhookEvent`** (interface) — intentionally thin: event `id` and optional `providerRef`. State is never read from the delivery; the caller must call `retrieve`.
- **`resolvePaymentProvider()`** — reads `NODE_PAYMENT_PROVIDER` from config and resolves the implementation from the registry. Returns `undefined` when unset (card payments off); throws on an unregistered name.
- **`providerNamed(name)`** — resolves the provider recorded on a **specific payment's** `provider` field. Must not be conflated with `resolvePaymentProvider` (new intent vs. existing payment).
- **Re-exports** — `registerPaymentProvider` (from `./registry`), `PaymentInFlightError` / `PaymentProviderError` (from `./errors`), and webhook-signature utilities (from `./webhook-signature`).
- **Boot probe** (truncated `pay…`) — validates at startup that the name in `NODE_PAYMENT_PROVIDER` is actually registered, catching typos before the first checkout.

## Relationships

- **`src/modules/payments/providers/registry.ts`** — supplies `paymentProviderRegistry` and `registerPaymentProvider`; this file re-exports the latter and calls the former in both resolvers.
- **`src/modules/payments/providers/errors.ts`** — defines the error classes re-exported here; `PaymentInFlightError` is thrown by `cancel` when an intent already succeeded.
- **`src/modules/payments/providers/webhook-signature.ts`** — source of `signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER`, and `WebhookRejected`; consumed by webhook controllers.
- **`src/modules/payments/config.ts`** — provides `paymentsConfig()` whose `NODE_PAYMENT_PROVIDER` value drives `resolvePaymentProvider`.
- **`src/infrastructure/runtime/provider-registry.ts`** — provides `requireProvider`, used by `resolvePaymentProvider` to resolve and validate the named implementation.
- **`src/infrastructure/config/define.ts`** — provides `defineConfig` / `probe` used by the boot probe.
- **`scenarios/support/doubles/payments/fake.ts`** — the in-process fake that implements `PaymentProvider`; registered before app load for dev, demo, and tests.
- **`scenarios/support/doubles/payments/register.ts`** — calls `registerPaymentProvider` with the fake so the registry is populated in non-production contexts.
- **`src/modules/payments/services/intent.ts`** — calls `prepare`, `confirm`, `cancel` on the resolved provider.
- **`src/modules/payments/services/settlement.ts`** — calls `retrieve` to get authoritative state (never trusts the webhook body).
- **`src/modules/payments/services/refunds.ts`** — calls `refund` with the idempotency key.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — calls `parseWebhook` and acts on the resulting `ProviderWebhookEvent`.
- **`src/modules/payments/module.ts`** — wires the provider port into the module's dependency graph.

## Notes

- **No provider ships with this codebase.** A production deployment adds exactly one implementation file and one `registerPaymentProvider` call. Absence of a provider means card payments are silently off — not an error.
- **Two resolvers, two questions.** `resolvePaymentProvider` answers "which provider opens a *new* intent?" while `providerNamed` answers "which provider *already took* this payment's money?" A deployment that changes `NODE_PAYMENT_PROVIDER` must not redirect old refunds to the new provider.
- **PCI boundary.** The `PaymentProvider` interface is designed so a card number never reaches this server. `confirm` receives an opaque `paymentMethodRef` (e.g. `pm_…`), not digits. `cardLast4` in `ProviderPaymentState` comes from the provider.
- **Webhook trust model.** `parseWebhook` must verify the signature over the raw body *before* parsing. The returned `ProviderWebhookEvent` carries only an id and a reference; settlement always calls `retrieve` to get the real state, because providers do not guarantee delivery order.
- **`clientSecret` is ephemeral.** It authorises completing a payment and must never be persisted, logged, or audited.
- **`cancel` throws `PaymentInFlightError`** if the intent already succeeded or is mid-flight — the caller must route to a refund instead.
- **`refund` idempotency is two-layered:** the provider-level `idempotencyKey` (e.g. `refund:{paymentId}`) protects against duplicate provider calls; the application-level conditional `addRefund` write protects against two local callers racing.
