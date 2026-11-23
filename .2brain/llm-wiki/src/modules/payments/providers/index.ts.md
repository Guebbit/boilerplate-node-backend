---
source: src/modules/payments/providers/index.ts
source_sha256: 5c4d229c433bd88aeacd842a8f87d67e139ae3f78c35b09b9db708f013669137
context_sha256: 678742c7ab32bfe61fa9fcbda7115dc73002bb2374a14cb3edee7e9139a0a9ca
generated_at: 2026-11-22T06:47:34.401683+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/providers/index.ts

## Purpose
Defines the payment provider port: the interface a real payment service provider (PSP) implements to plug into the payments module. Which implementation is used is a deployment decision (`NODE_PAYMENT_PROVIDER`). The boilerplate ships no real provider, so production has no card payments until a project adds one file and one `registerPaymentProvider` call. The `fake` provider used in dev, demo and tests is a double under `scenarios/support/doubles/`, registered before the app loads.

## Key elements
- **`PaymentProvider`** (interface): what an implementation must provide.
  - `name`: persisted on each payment document.
  - `prepare(charge, metadata, existingProviderRef?)`: opens an intent for an already-frozen amount. It is idempotent on `metadata.paymentId` and resumes an existing intent when one is given.
  - `confirm(providerRef, paymentMethodRef)`: attaches a tokenised payment method and charges. A decline is returned as an answer. Only transport failures throw.
  - `retrieve(providerRef)`: reads the authoritative state back.
  - Refund methods (`refund`, `retrieveRefund`) and webhook parsing (`parseWebhook`) are also part of the port. The shown part of the file only describes them in doc comments, so check the source for their exact signatures.
- **Data types**:
  - `ProviderPaymentStatus`: `'open' | 'requires_action' | 'processing' | 'succeeded' | 'declined'`.
  - `ProviderPaymentState`: status, `cardLast4`, `amountReceived`, `currency`, `paymentId`.
  - `PreparedPayment`: `providerRef` plus an optional `clientSecret`.
  - `RefundedByProvider`: `refundRef` and a status of `pending` or `succeeded`.
  - `ProviderRefundState`: status of `pending`, `succeeded` or `failed`, plus `failureReason` and `refundId`.
  - `ProviderRefund`: extends `ProviderRefundState` with `refundRef`, `amount`, `currency` and `createdAt`.
  - `ProviderDisputeState`: an alias of `DisputeReport`.
  - `ProviderWebhookEvent`: a normalised, deliberately thin delivery (`id`, optional `providerRef`, `refundRef`, `dispute`).
- **Re-exports**: `PaymentInFlightError` and `PaymentProviderError` from `./errors`. `signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER` and `WebhookRejected` from `./webhook-signature`.
- **Imports** the following, which the shown portion does not use beyond the type declarations: `requireProvider`, `defineProbe`, `paymentsConfig`, `paymentProviderRegistry`, `IncomingHttpHeaders`.

## Relationships
- `./errors` and `./webhook-signature`: re-exported from this file, so callers import them from the providers index.
- `./registry` (`paymentProviderRegistry`) and `src/infrastructure/runtime/provider-registry.ts` (`requireProvider`): used to select and resolve the active provider.
- `scenarios/support/doubles/payments/fake.ts` and `register.ts`: the `fake` implementation and its registration, which happens before the app loads.
- `src/infrastructure/config/define.ts` (`defineProbe`) and `../config` (`paymentsConfig`): imported by this file.
- `src/modules/payments/controllers/post-payment-webhook.ts` and the `post-payment-refund*.ts` controllers in the same directory (refund, cancel, settle): consumers of the port.
- `src/modules/payments/domain/display-status.ts`, `src/modules/payments/domain/dispute-end.ts` and `src/modules/payments/module.ts`: neighbors in the graph, but the shown content does not describe how they interact with this file.

## Notes
- The card never reaches this server. Only opaque method handles (`pm_…`) are accepted, and `clientSecret` must never be persisted, logged or audited.
- Webhook events are thin on purpose. The body is not trusted for the outcome, and settlement re-reads state with `retrieve` (or `retrieveRefund` for refunds). Disputes are the exception: they carry their own state, ordered by `observedAt`.
- Money duties for real adapters:
  - `confirm` makes at most one successful charge per `providerRef`.
  - `refund` sends an idempotency key (`refund:{paymentId}:{refundId}`) and stamps and echoes `refundId`.
  - Once the provider's key window has passed, the adapter adopts the refund that carries `refundId` instead of creating a new one.
- A real `parseWebhook` must verify the provider's signature over the raw body and must not trust any payment status reported by the browser.
- Adapter requests must time out well under the idempotency ledger's five-minute lease (`IN_FLIGHT_LEASE_MS`) and the refund sweep's 10-minute lease.
- Amounts are decimal strings, and currencies are upper-case ISO-4217. Adapters convert from the provider's minor units.
