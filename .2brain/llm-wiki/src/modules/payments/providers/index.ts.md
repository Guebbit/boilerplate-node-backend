---
source: src/modules/payments/providers/index.ts
sha256: 1e53c4457eaeecad1b7f5b8ce335eb9f387803212b1f578402e47d106507c9ad
generated_at: 2026-11-14T21:03:10.968533+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/index.ts

## Purpose

Defines the **payment provider port** — the typed contract (interfaces, status unions, and the `PaymentProvider` interface) that any real PSP adapter or the test double must implement. It is the single seam where the application talks to a payment service: the card never reaches this server, an intent is prepared before charging, and the authoritative outcome arrives asynchronously via webhook. No production provider ships with the boilerplate; a live project adds one adapter file plus one `registerPaymentProvider` call.

## Key elements

- **`ProviderPaymentStatus`** — union of the five provider-side states (`open`, `requires_action`, `processing`, `succeeded`, `declined`). Cancellation and refund state are owned by this application, not the provider.
- **`ProviderPaymentState`** — what a provider reports for one intent (status, `cardLast4`, `amountReceived`, `currency`, `paymentId`). `amountReceived` is required to verify a `succeeded` settlement.
- **`PreparedPayment`** — return value of `prepare`: the `providerRef` (persisted) and an optional `clientSecret` (hand-to-browser, never stored).
- **`RefundedByProvider` / `ProviderRefundState` / `ProviderRefund`** — refund lifecycle types; distinguish "immediate refusal" (throws) from "accepted but pending" and from later provider-side failure.
- **`ProviderDisputeState`** — alias for `DisputeReport`; the one webhook event that carries its own state (Adyen has no re-read endpoint).
- **`ProviderWebhookEvent`** — deliberately thin delivery envelope (event `id`, `providerRef`, `refundRef`, optional `dispute`). The body is never trusted for outcome; settlement re-reads via `retrieve`.
- **`PaymentProvider`** — the interface every adapter implements. Methods: `prepare`, `confirm`, `retrieve`, refund, refund retrieval, dispute handling, and `parseWebhook`. Carries extensive idempotency and lease-timing contracts.
- **Re-exports** — `PaymentInFlightError`, `PaymentProviderError` from `./errors`; `signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER`, `WebhookRejected` from `./webhook-signature`.

## Relationships

- **`src/modules/payments/providers/registry.ts`** (`paymentProviderRegistry`) — the runtime lookup table; `requireProvider` (from `provider-registry`) resolves the active adapter by name at call time.
- **`src/modules/payments/providers/errors.ts`** — source of the two exported error classes; kept separate to avoid circular imports.
- **`src/modules/payments/providers/webhook-signature.ts`** — HMAC signing/verification helpers re-exported here so consumers import from one place.
- **`src/modules/payments/config.ts`** (`paymentsConfig`) — provides configuration (e.g. provider name, lease constants) that the port's timing contracts reference.
- **`src/infrastructure/config/define.ts`** (`defineProbe`) — used to register a health-readiness probe tied to provider availability.
- **`src/infrastructure/runtime/provider-registry.ts`** (`requireProvider`) — the runtime mechanism that selects which implementation answers, keyed by `NODE_PAYMENT_PROVIDER`.
- **Controllers** (`src/modules/payments/controllers/post-payment-webhook.ts`, `post-payment-refund.ts`, `post-payment-refund-settle.ts`, `post-payment-refund-cancel.ts`) — the primary consumers that call `parseWebhook`, `refund`, `retrieveRefund`, etc. through the resolved `PaymentProvider`.
- **`scenarios/support/doubles/payments/fake.ts`** — the in-process double that implements `PaymentProvider` for dev, demo, and tests.
- **`scenarios/support/doubles/payments/register.ts`** — calls `registerPaymentProvider` to install the fake before the app boots.
- **`src/modules/payments/domain/display-status.ts`** — domain-level status mapping; the provider statuses defined here are the source it translates from.
- **`src/modules/payments/services/deadline.ts`** — lease/deadline service; the port's docstrings reference its five-minute in-flight lease and the refund-sweep lease that adapters must respect.

## Notes

- The file is a **pure type/interface module** — no runtime logic beyond the re-exports and the two imported bindings (`requireProvider`, `defineProbe`, `paymentsConfig`, `paymentProviderRegistry`). Adding a new provider requires only implementing `PaymentProvider` and calling `registerPaymentProvider`; no changes to this file.
- `clientSecret` is explicitly marked "NEVER persisted, logged or audited." Any adapter that writes it to storage violates the contract.
- Idempotency is a **two-layer** concern: the provider's own key (e.g. `refund:{paymentId}:{refundId}`) prevents double-charges at the PSP, while the application's conditional write prevents double-recording locally. Adapters must honour both.
- Adapters must time their outbound calls well inside the relevant lease window (5 min for the idempotency ledger; 10 min for the refund sweep) or a retry will read a false "outcome unknown."
- Webhook bodies are **never** trusted for payment status; the settlement path always calls `retrieve`. The single exception is the dispute event, which carries its own state and is ordered by `observedAt`.
