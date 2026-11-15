---
source: scenarios/support/doubles/payments/fake.ts
sha256: 62185d14d13ac00de04ebfbadc1f38d952819c5391f8c8c5a5d16f3370763d43
generated_at: 2026-11-14T17:17:52.221921+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/fake.ts

## Purpose

A fake payment service provider (PSP) that lives outside `src/` and is registered only by the dev preload and Jest setup. It mimics the shape a real provider (e.g. Stripe) presents to the application — intent references, asynchronous states (`requires_action`, `processing`), terminal states, and HMAC-signed webhooks — so that demos and every e2e/contract/integration test can walk 3-D Secure, webhook, refund, and dispute paths without a real provider account. It never makes external network calls.

## Key elements

- **`TEST_METHODS`** – Maps provider test-token references (`pm_card_declined`, `pm_card_authentication_required`, `pm_card_processing`) to their initial and settled `ProviderPaymentState`. Any unrecognised reference succeeds with its last-four taken from the reference tail.
- **`FAKE_SUCCESS_METHOD` / `FAKE_DECLINE_METHOD`** – Convenience constants for the default success and decline references.
- **In-memory state maps** (`outcomes`, `intents`, `receiptOverrides`, `refundFailures`, `disputes`, `refundObjects`, `refundTimeouts`, `pendingRefundIntents`, idempotency keys) – Deliberately non-persistent; an unknown intent answers `open` (settles nothing).
- **`setFakeOutcome`** – Test lever: pre-loads a settled state so `retrieve` returns it as if the customer finished at the provider without a server-side `confirm` (enables webhook-arrives-before-confirm scenarios).
- **`setFakeReceipt`** – Test lever: overrides `amountReceived`, `currency`, or `paymentId` on a `succeeded` answer.
- **`setFakeRefundFailure`** – Test lever: makes refunds on an intent throw a closed `RefundFailureReason`.
- **`setFakeRefundTimeout`** – Test lever: next refund executes at the "provider" but the response is lost (`provider_unavailable`); one-shot.
- **`setFakeRefundPending` / `setFakeRefundOutcome`** – Test levers: hold refunds in `pending` state, then settle or fail them individually.
- **`addFakeExternalRefund`** – Test lever: injects a refund that only appeared in the provider's dashboard (shows in `listRefunds`, not elsewhere).
- **`setFakeDispute` / `fakeDisputeOf`** – Test levers: record and retrieve the latest dispute state per intent/dispute pair.
- **`signFakeDelivery`** – Serialises a `ProviderWebhookEvent` to JSON and returns the body plus the `WEBHOOK_SIGNATURE_HEADER` (via `signWebhookPayload`), ready for `paymentService.receiveWebhook` or an HTTP POST.
- **`withReceipt`** (internal) – Enriches a `succeeded` state with prepared/overridden receipt fields before returning it.

## Relationships

- **`scenarios/support/doubles/payments/register.ts`** – Imports and registers this fake as the active `PaymentProvider` in the dev preload and Jest global setup.
- **`scenarios/support/doubles/payments/levers.ts`** – Re-exports or wraps the `setFake*` / `addFake*` functions so test files import from a single entry point.
- **`src/modules/payments/providers/index.ts`** – The file implements the `PaymentProvider` interface and consumes the `ProviderPaymentState`, `ProviderRefundState`, `ProviderDisputeState`, and `ProviderWebhookEvent` types defined there.
- **`src/modules/payments/providers/webhook-signature.ts`** – Uses `signWebhookPayload` to sign deliveries and relies on `WEBHOOK_SIGNATURE_HEADER` for the header name.
- **`src/modules/payments/providers/errors.ts`** – Imports `PaymentProviderError`, `PaymentInFlightError`, and `WebhookRejected` to throw or detect in the fake's responses.
- **`src/modules/payments/domain/index.ts`** – Imports `FINAL_REFUND_FAILURES` to validate closed refund-failure codes.
- **`src/domain-primitives/time.ts`** – Imports `DAY_MS` to size the idempotency-key window (one day from first use).
- **`src/infrastructure/adapters/logger.ts`** – Imports `logger` for diagnostic output inside the fake.
- **`src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts`** – Drives the fake through its levers to exercise credit-note and refund-catch-up flows.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** – Exercises the fake's confirm/retrieve/refund/dispute API surface against the contract.
- **`src/modules/payments/tests/deliver.ts`** – Uses `signFakeDelivery` to hand signed webhook deliveries to the payment service.
- **`src/modules/payments/tests/integration/announce.test.ts`** – Drives webhook-announce scenarios through the fake.
- **`src/modules/payments/tests/integration/cancel-redelivery.test.ts`** – Exercises cancel-and-redelivery paths against the fake.
- **`src/modules/payments/tests/integration/canceled.test.ts`** – Exercises canceled-intent flows against the fake.

## Notes

- All state is in-process memory. A restart or a second worker forgets everything; `retrieve` for an unknown reference intentionally answers `open` so the application settles nothing rather than guessing.
- The idempotency-key window mirrors Stripe: one day from the key's *first* use, not each subsequent call.
- `setFakeRefundTimeout` is one-shot — the flag clears itself after the next refund on that intent.
- `setFakeRefundFailure` accepts `undefined` to *clear* a previously set failure; passing a value sets or overwrites it.
- Method references are opaque handles (e.g. `pm_card_visa`), never card numbers; last-four digits are derived from the reference tail for unlisted methods.
- The file is a `@module` (no default export); all public API is named exports.
