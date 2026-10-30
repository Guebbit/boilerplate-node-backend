---
source: scenarios/support/doubles/payments/fake.ts
sha256: debbd1d01ba4ddad5b22847faa99abb009b1eacfe4e03fed44fa3fbd923bc374
generated_at: 2026-10-29T01:26:57.247862+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/fake.ts

## Purpose

A fake Payment Service Provider (PSP) test double that implements the `PaymentProvider` interface entirely in memory. It exists so that demos, e2e flows, and integration tests can exercise 3-D Secure, webhook delivery, refunds, disputes, and decline paths without a real PSP account. It never performs I/O; all state lives in process-local `Map`s and `Set`s.

## Key elements

- **`TEST_METHODS`** – Static table of recognised test tokens (`pm_card_declined`, `pm_card_authentication_required`, `pm_card_processing`) mapping to initial and terminal `ProviderPaymentState`s.
- **`FAKE_SUCCESS_METHOD` / `FAKE_DECLINE_METHOD`** – Exported token strings (`pm_card_visa`, `pm_card_declined`) that tests pass to drive the happy or decline path.
- **`setFakeOutcome(ref, state)`** – Test lever: makes `retrieve` report `state` for a ref that was never `confirm`ed (simulates a 3-D Secure completing off-server).
- **`setFakeReceipt(ref, override)`** – Test lever: overrides `amountReceived`, `currency`, or `paymentId` on a `succeeded` answer.
- **`setFakeRefundFailure(ref, reason?)`** – Test lever: forces the next refund(s) on an intent to throw a classified `RefundFailureReason`; pass `undefined` to clear.
- **`setFakeRefundTimeout(ref, on)`** – Test lever: arms a one-shot `provider_unavailable` response for the next refund.
- **`setFakeRefundPending(ref, on)`** / **`setFakeRefundOutcome(refundRef, state)`** – Hold refunds in `pending` then settle/fail them individually.
- **`addFakeExternalRefund(ref, data)`** – Injects a refund as if made in the PSP dashboard; appears in `listRefunds` with a generated `re_dashboard_*` id.
- **`setFakeDispute(ref, dispute)`** – Records a dispute state and returns a `ProviderWebhookEvent` ready for delivery.
- **`fakeDisputeOf(ref, disputeRef)`** – Reads back the last recorded dispute state.
- **`signFakeDelivery(event)`** – Serialises a `ProviderWebhookEvent` to a JSON body and signs it with `signWebhookPayload`, returning `{ body, headers }` for the real webhook route.
- **`withReceipt(ref, state)`** (internal) – Attaches `amountReceived`/`currency`/`paymentId` to a `succeeded` state using overrides → prepared intent → defaults.
- **`outcomes`, `intents`, `receiptOverrides`, `refundFailures`, `disputes`, `refundTimeouts`, `refundObjects`, `pendingRefundIntents`** – Module-scoped in-memory stores backing all levers.

## Relationships

- **`scenarios/support/doubles/payments/register.ts`** – Registers this fake as the active `PaymentProvider` during Jest setup and the dev preload; this file is the thing being registered.
- **`scenarios/support/doubles/payments/levers.ts`** – Higher-level test helpers that compose or wrap the individual levers exported here.
- **`src/modules/payments/providers/index.ts`** (and its sub-modules `errors.ts`, `webhook-signature.ts`) – Source of the `PaymentProvider` interface, `ProviderPaymentState`, `signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER`, and error classes this file imports and implements against.
- **`src/modules/payments/domain/index.ts`** – Provides `FINAL_REFUND_FAILURES` used to classify refund errors.
- **`src/infrastructure/adapters/logger.ts`** – Imported for structured logging of fake operations (e.g. confirm, retrieve, refund).
- **Test consumers** (`announce.test.ts`, `disputes.test.ts`, `external-refunds.test.ts`, `hand-refund.test.ts`, `cancelled.test.ts`, `api.contract.test.ts`, `credit-note-catch-up.test.ts`) – Import specific levers to script provider behaviour before calling application endpoints.

## Notes

- **No persistence.** All state is in-memory; a process restart or a second Jest worker loses everything. `retrieve` for an unknown ref deliberately returns `processing` (the only state that "settles nothing") rather than fabricating an outcome.
- **One-shot levers.** `setFakeRefundTimeout` and refund-failure entries fire once per intent and then clear; tests that need repeatable failure must re-arm.
- **Webhook signing uses the real `signWebhookPayload`.** The fake does not skip signature verification—it produces valid HMAC signatures so the receiving route's `verifyWebhookSignature` path is exercised.
- **`pm_card_visa` is not in `TEST_METHODS`.** It falls through to the "anything else succeeds" default; its last-4 is derived from the token's tail.
- **File lives outside `src/`.** It is importable only from test/scenario code; production code must never reference it.
