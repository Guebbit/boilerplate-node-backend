---
source: scenarios/support/doubles/payments/fake.ts
source_sha256: 7402709fdfc6f724ab39153afc80d9a9b97ad43b628cf1047982dc718d7bbd31
context_sha256: b0709059dbf50c654f17f58656d133f257dd737ec3a99d78dc6b08d740b48b4c
generated_at: 2026-11-22T01:47:48.471211+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/payments/fake.ts

## Purpose
The fake PSP (payment service provider): a test double that is never shipped. It lives outside `src/` and is registered only by the development doubles and the jest setup (`./register`). It makes no external calls, but imitates a real PSP's shape. It hands back an intent reference for the browser to finish against, answers with asynchronous states (`requires_action`, `processing`) as well as terminal ones, and signs its webhooks. Demos and e2e tests can therefore exercise the 3-D Secure and webhook paths without a provider account.

## Key elements
- `TEST_METHODS` (internal): maps opaque method references to behaviour.
  - `pm_card_declined` gives `declined`, last4 `0002`.
  - `pm_card_authentication_required` gives `requires_action`, last4 `3155`, settling to `succeeded`.
  - `pm_card_processing` gives `processing`, last4 `0000`, settling to `succeeded`.
  - Any other reference succeeds, with its last four digits taken from the reference's tail.
- `FAKE_SUCCESS_METHOD` (`pm_card_visa`): the reference the demo panel sends by default.
- `FAKE_DECLINE_METHOD` (`pm_card_declined`): the one refused reference.
- In-memory state maps:
  - `outcomes`: the eventual outcome of a confirmed intent, read by `retrieve`.
  - `intents`: amount, currency and payment id each intent was prepared with.
  - `receiptOverrides`.
  - `refundFailures`.
  - `disputes`.
  - `refundObjects`.
  - Sets for refund timeouts and pending-refund intents.
- `withReceipt` (internal): fills a `succeeded` state with `amountReceived`, `currency` and `paymentId`. It uses the override first, then the prepared values. Other states report no money.
- Test levers (exported):
  - `setFakeReceipt`: makes `succeeded` report a different amount, currency or payment id.
  - `setFakeOutcome`: sets what `retrieve` answers, as if the customer finished at the provider without any `confirm` reaching the server. This is the only way for a webhook to find an unconfirmed outcome.
  - `setFakeRefundFailure`: makes refunds on an intent refuse with a given `RefundFailureReason`, or clears it with `undefined`.
  - `setFakeRefundTimeout`: one-shot. The next refund executes at the provider but the answer is lost (`provider_unavailable`).
  - `setFakeRefundPending`: holds refunds as `pending` until `setFakeRefundOutcome` settles them.
  - `addFakeExternalRefund`: adds a dashboard-made refund, with no record id, that appears only in `listRefunds`. It returns its refund id (`re_dashboard_<n>`).
  - `setFakeDispute`: records a dispute state and returns a `ProviderWebhookEvent` (`evt_dispute_<ref>_<observedAt>`).
  - `fakeDisputeOf`: reads back the last dispute state held.
  - `signFakeDelivery`: JSON-serialises an event and signs it with `signWebhookPayload`, returning `{ body, headers }` keyed by `WEBHOOK_SIGNATURE_HEADER`.
- Idempotency support: `KEY_WINDOW_MS` (one day, from `DAY_MS`) and the `KeyedAnswer` type record what an idempotency key first produced, mirroring Stripe. `FakeRefund` and `stateOf` model a provider-side refund object and its status slice.
- The imports (`createHmac`, `IncomingHttpHeaders`, `logger`, `FINAL_REFUND_FAILURES`, `PaymentInFlightError`, `PaymentProviderError`, `verifyWebhookSignature`, `WebhookRejected`, `PaymentProvider`) point to a `PaymentProvider` implementation and webhook verification, but that part lies beyond the visible portion of the file.

## Relationships
- `src/modules/payments/providers/index.ts` supplies the `PaymentProvider` contract, state types (`ProviderPaymentState`, `ProviderRefundState`, `ProviderDisputeState`, `ProviderWebhookEvent`), the error classes, and the webhook signing and verification helpers and header name. The fake is built against these.
- `src/modules/payments/domain/index.ts` supplies `FINAL_REFUND_FAILURES`.
- `src/domain-primitives/time.ts` supplies `DAY_MS`, used for the idempotency window.
- `src/infrastructure/adapters/logger.ts` supplies the logger.
- `scenarios/support/doubles/payments/register.ts` registers the fake. `scenarios/support/doubles/payments/levers.ts` sits alongside it in the same doubles folder.
- The payments and invoicing tests (`src/modules/payments/tests/integration/announce.test.ts`, `src/modules/payments/tests/integration/canceled.test.ts`, `src/modules/payments/tests/integration/cancel-redelivery.test.ts`, `src/modules/payments/tests/contract/api.contract.test.ts`, `src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts`) and `src/modules/payments/tests/deliver.ts` are the likely consumers of the levers and signing helper.

## Notes
- All state is module-level and in-memory. A restart or a second worker forgets it, so `retrieve` answers `open` for an unknown reference. `open` settles nothing, which is the intended safe default.
- `setFakeDispute` only returns the event. The caller must sign it with `signFakeDelivery` and hand it to `paymentService.receiveWebhook`, or post it to the real webhook route.
- Method references are opaque handles, never card numbers.
