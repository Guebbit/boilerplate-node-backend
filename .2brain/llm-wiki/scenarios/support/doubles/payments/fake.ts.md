---
source: scenarios/support/doubles/payments/fake.ts
sha256: c5d371c9b0a80f846775f1769027f534528da109f5a724a179ec7cdf49f9258a
generated_at: 2026-11-08T02:34:07.040729+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/fake.ts

## Purpose

A fake Payment Service Provider (PSP) that implements the `PaymentProvider` interface for local development and test suites. It mimics the async state machine a real PSP exposes (`requires_action`, `processing`, terminal states), signs its own webhooks with HMAC, and holds all state in in-memory `Map`/`Set` structures. It is never shipped to production; it is registered only via the dev preload and the Jest setup.

## Key elements

- **`FAKE_SUCCESS_METHOD` / `FAKE_DECLINE_METHOD`** – Exported string constants (`pm_card_visa`, `pm_card_declined`) that the demo panel and tests reference to steer the fake toward a success or a decline.
- **`TEST_METHODS`** – Internal record mapping method references (`pm_card_declined`, `pm_card_authentication_required`, `pm_card_processing`) to their initial `ProviderPaymentState` and the state they "settle" to. Unrecognised references default to a generic success path.
- **`setFakeReceipt(providerRef, receipt)`** – Test lever: overrides the `amountReceived`, `currency`, or `paymentId` the fake reports on a `succeeded` answer for a given intent.
- **`setFakeOutcome(providerRef, state)`** – Test lever: seeds an outcome for an intent that was never `confirm`-ed by the application, simulating a 3-D Secure completed out-of-band.
- **`setFakeRefundFailure(providerRef, reason)`** – Test lever: makes every refund on the given intent fail with the supplied `RefundFailureReason`; pass `undefined` to clear.
- **`setFakeRefundTimeout(providerRef, on)`** – Test lever: arms a one-shot flag so the next refund executes at the provider but the response is lost (`provider_unavailable`).
- **`setFakeDispute(providerRef, dispute)`** – Test lever: records a dispute state and returns a `ProviderWebhookEvent` delivery.
- **`fakeDisputeOf(providerRef, disputeRef)`** – Read back the latest recorded dispute state for an intent.
- **`signFakeDelivery(event)`** – Serialises a `ProviderWebhookEvent` to a JSON body and signs it with `signWebhookPayload`, returning the body and the `WEBHOOK_SIGNATURE_HEADER` for use through the real webhook route.
- **`addFakeExternalRefund(providerRef, refund)`** – Test lever: registers a refund that exists only at the provider (no in-app record), visible in `listRefunds`.
- **`setFakeRefundPending(providerRef, on)`** – Test lever: holds refunds in `pending` state until explicitly settled via `setFakeRefundOutcome`.
- **`setFakeRefundOutcome(refundRef, state)`** – (truncated) Test lever: changes the reported status of a specific refund after the fact.
- **`withReceipt(providerRef, state)`** – Internal helper that enriches a `succeeded` state with the prepared or overridden receipt fields.
- **Idempotency-key handling** – Uses a `DAY_MS` window (from `@domain-primitives/time`) to replay a keyed answer once within 24 hours, mirroring Stripe's key-reuse semantics.

## Relationships

- **`scenarios/support/doubles/payments/register.ts`** – Imports this module to register the fake as the active `PaymentProvider` during dev preload and Jest setup.
- **`scenarios/support/doubles/payments/levers.ts`** – Re-exports or wraps the test-lever functions (`setFakeOutcome`, `setFakeReceipt`, etc.) for convenient use in test files.
- **`src/modules/payments/providers/index.ts`** – Source of the `PaymentProvider` interface, `ProviderPaymentState`, `ProviderDisputeState`, `ProviderRefundState`, `ProviderWebhookEvent`, `signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER`, and the error classes the fake implements or throws.
- **`src/modules/payments/providers/errors.ts`** – Provides `PaymentInFlightError`, `PaymentProviderError`, `WebhookRejected` used in the fake's error paths.
- **`src/modules/payments/providers/webhook-signature.ts`** – Underlying HMAC logic used by `signWebhookPayload` and `verifyWebhookSignature` (imported transitively via the providers barrel).
- **`src/modules/payments/domain/index.ts`** – Exports `FINAL_REFUND_FAILURES`, the closed set of refund-failure codes the fake can throw.
- **`src/domain-primitives/time.ts`** – Supplies `DAY_MS` for the idempotency-key expiry window.
- **`src/infrastructure/adapters/logger.ts`** – Supplies the shared `logger` instance for diagnostic output.
- **Integration / contract tests** (`announce.test.ts`, `canceled.test.ts`, `disputes.test.ts`, `external-refunds.test.ts`, `api.contract.test.ts`, `credit-note-catch-up.test.ts`) – All consume the fake (directly or via `register`/`levers`) to exercise payment lifecycles without a live PSP.

## Notes

- **In-memory only.** All state (`outcomes`, `intents`, `receiptOverrides`, `refundFailures`, `disputes`, `refundTimeouts`, `refundObjects`, `pendingRefundIntents`) lives in module-level `Map`/`Set` instances. A process restart or a second worker loses everything; `retrieve` answers `processing` for any unknown reference deliberately, because `processing` is the only state that settles nothing.
- **Not a second database.** The file's own comments stress that introducing a persistent store would create a second payments database to keep consistent; the stub is intentionally ephemeral.
- **Method references are opaque handles**, not card numbers. The naming (`pm_card_*`) mirrors a real provider's test-token vocabulary so that demo and test code reads identically.
- **Webhook signing is real.** Despite being a fake, the HMAC signing (`signFakeDelivery`) goes through the same `signWebhookPayload` code path a production adapter uses, so signature-verification bugs surface in tests.
- **One-shot semantics.** `setFakeRefundTimeout` arms a flag that clears itself after a single refund attempt; all other levers are persistent until explicitly cleared or overwritten.
