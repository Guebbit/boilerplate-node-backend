---
source: scenarios/support/doubles/payments/fake.ts
sha256: f6b5bc21e719342c971d0d0ed58046716a7cd04d59baa04ab5e34423b6f930d1
generated_at: 2026-10-14T07:04:28.201165+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/fake.ts

## Purpose

A fake Payment Service Provider (PSP) used exclusively in tests and the dev demo. It implements the `PaymentProvider` port without any network I/O, letting the full 3-D Secure flow, webhook delivery, refund, and cancellation paths run end-to-end without a real PSP account. It lives outside `src/` and is wired in only by the dev preload and the Jest setup via `register.ts`.

## Key elements

- **`fakePaymentProvider`** – The `PaymentProvider` object exported as the module's default double. Implements `prepare`, `confirm`, `retrieve`, `refund`, `cancel`, and `parseWebhook`. Every call is logged via the shared `logger`.
- **`FAKE_SUCCESS_METHOD`** (`pm_card_visa`) / **`FAKE_DECLINE_METHOD`** (`pm_card_declined`) – Well-known payment-method refs the test UI or assertions pass in to trigger the success or decline path.
- **`TEST_METHODS`** – Internal map of special refs (`pm_card_declined`, `pm_card_authentication_required`, `pm_card_processing`) to their immediate and settled `ProviderPaymentState`. Any unrecognised ref defaults to `succeeded`.
- **`outcomes` / `intents` / `receiptOverrides` / `refundFailures` / `cancelledIntents`** – In-memory `Map`/`Set` stores backing the fake's state. No persistence: a process restart or second worker forgets everything.
- **`setFakeOutcome(providerRef, state)`** – Test lever: pre-seeds what `retrieve` will answer, simulating an outcome that settled at the provider without a `confirm` reaching the server (e.g. 3-D Secure in another tab).
- **`setFakeReceipt(providerRef, receipt)`** – Test lever: overrides `amountReceived`, `currency`, or `paymentId` on a `succeeded` response, simulating a provider that collects the wrong money.
- **`setFakeRefundFailure(providerRef, reason | undefined)`** – Test lever: makes `refund` reject with a `PaymentProviderError` carrying the given `RefundFailureReason`; pass `undefined` to clear.
- **`withReceipt(providerRef, state)`** – Internal helper that merges receipt fields from `receiptOverrides`, then the prepared `intents` entry, into a `succeeded` state.
- **`lastFourOf(ref)`** – Extracts the trailing 4 digits from a payment-method ref (default `4242`).
- **`parseWebhook(rawBody, signature)`** – Verifies the HMAC signature via `verifyWebhookSignature`, then parses the body against the Zod contract schema before resolving the normalised `ReceivePaymentWebhookBody`. Throws `WebhookRejected` on failure.

## Relationships

- **`scenarios/support/doubles/payments/register.ts`** – The sole registrar: imports this module and installs `fakePaymentProvider` into the provider registry for Jest and the dev preload. This file has no other production consumers.
- **`src/modules/payments/providers/index.ts`** – Source of the `PaymentProvider` interface, `ProviderPaymentState`, `PaymentProviderError`, `PaymentInFlightError`, `WebhookRejected`, and `verifyWebhookSignature` that this file imports and implements.
- **`src/modules/payments/providers/webhook-signature.ts`** – Provides `verifyWebhookSignature`, called inside `parseWebhook` to validate the HMAC before the body is trusted.
- **`src/modules/payments/providers/errors.ts`** – Source of `PaymentProviderError` and `PaymentInFlightError`, thrown by `refund` (simulated failure) and `cancel` (already-succeeded guard) respectively.
- **`src/infrastructure/adapters/logger.ts`** – The shared `logger` used for every method's audit log line.
- **Integration tests** (`announce`, `cancelled`, `intent-provider-ref`, `reconcile`, `refund-email`, `refunds`, `service`, `settlement-email`, `settlement-mismatch`) – Import the test levers (`setFakeOutcome`, `setFakeReceipt`, `setFakeRefundFailure`) and the well-known refs to drive specific scenario paths.
- **Contract test** (`api.contract.test.ts`) – Exercises the full `PaymentProvider` contract against this double.

## Notes

- **State is process-local and non-persistent.** `outcomes` and `intents` are plain `Map`s. A restart or a second Jest worker sees an empty store. `retrieve` for an unknown ref deliberately returns `processing` — the only state that settles nothing — so a forgotten intent never fabricates a terminal outcome.
- **Idempotency is structural, not enforced.** `prepare` derives `providerRef` from `metadata.paymentId` (or accepts `existingProviderRef`), and `clientSecret` is an HMAC of that ref. Re-calling `prepare` with the same payment id yields the same ref and secret, so a double-click does not open a second intent. `refund` derives `refundRef` from the `idempotencyKey` for the same reason.
- **`confirm` writes straight to the settled outcome.** There is no intermediate `processing` phase in `outcomes` after `confirm`; the `cancelledIntents` guard only checks for `succeeded`. A real provider may rest on `processing`, which the cancel path's comment acknowledges but this fake does not exercise.
- **Stryker mutation-testing annotations** (`// Stryker disable … restore`) wrap the `logger` calls so that killing a log line does not produce a false-positive surviving mutant.
- **`parseWebhook` wraps its logic in `Promise.resolve()`** so that synchronous throws (bad signature, schema mismatch) surface as rejected promises, keeping the caller's `.catch` contract uniform.
