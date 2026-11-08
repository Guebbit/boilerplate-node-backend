---
source: tests/unit/scenarios/payments-fake.test.ts
sha256: cab8349e38f5b03b86fe9b4098eae0a83a7929b6b6e5b3d1997892d2f32fad2c
generated_at: 2026-11-08T10:30:19.666709+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/payments-fake.test.ts

## Purpose

Unit tests for the fake PSP double (`fakePaymentProvider`), verifying its outcome-mapping logic for every port method: `prepare`, `confirm`, `retrieve`, `refund`, `cancel`, `parseWebhook`, and disputes. The file exists to pin down the behavioral contract the rest of the scenario suite relies on, without mocks or a database.

## Key elements

- **`fakePaymentProvider.prepare` tests** — reference derivation is idempotent per payment; distinct payments get distinct refs; `clientSecret` is defined and differs from `providerRef`.
- **`fakePaymentProvider.confirm` tests** — method-reference → status mapping (`FAKE_DECLINE_METHOD` → declined, authentication method → `requires_action`, processing method → processing, `FAKE_SUCCESS_METHOD` → succeeded); card last-4 extraction.
- **`fakePaymentProvider.retrieve` tests** — settled outcome supersedes the initial confirm answer; declined stays declined; lever-set outcomes (`setFakeOutcome`) are visible without a prior confirm; unknown intent returns `status: 'open'`.
- **`fakePaymentProvider.refund` tests** — always succeeds by default; idempotent per key; partial refund leaves intent `succeeded`; `setFakeRefundFailure` / `setFakeRefundTimeout` levers simulate provider-side failure, definite-refusal replay, and timeout-then-replay; `ageFakeRefundKeys(25h)` expires keys so a same-key call creates a new refund or adopts an existing record.
- **`fakePaymentProvider.cancel` tests** — closes unconfirmed intents; idempotent on repeat; allowed after a declined confirm; throws `PaymentInFlightError` if the intent already succeeded.
- **`fakePaymentProvider.parseWebhook` tests** — accepts a validly signed body and returns `{ id, providerRef }`; rejects unsigned (wrong sig) with `WebhookRejected`; tolerates a missing `providerRef`; rejects non-JSON bodies.
- **Dispute tests** (truncated in source) — exercise `setFakeDispute` / `fakeDisputeOf` / `signFakeDelivery`.
- **`keyed(idempotencyKey, createdAt?)`** — local helper that builds the third-argument record for `refund`.
- **`signed(body)`** — local helper that produces a headers object with a valid `WEBHOOK_SIGNATURE_HEADER` via `signWebhookPayload`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — the module under test. All provider methods and levers (`setFakeOutcome`, `setFakeRefundFailure`, `setFakeRefundTimeout`, `ageFakeRefundKeys`, `setFakeReceipt`, `setFakeDispute`, `fakeDisputeOf`, `signFakeDelivery`, constants) are imported from here.
- **`src/modules/payments/providers/index.ts`** — barrel import source for `PaymentInFlightError`, `signWebhookPayload`, `WEBHOOK_SIGNATURE_HEADER`, and `WebhookRejected`.
- **`src/modules/payments/providers/errors.ts`** — defines `PaymentInFlightError` and `WebhookRejected`, both used in rejection assertions.
- **`src/modules/payments/providers/webhook-signature.ts`** — origin of `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER`, re-exported through the barrel; used by the `signed()` helper to mint valid signatures.

## Notes

- The module docblock explicitly states this file tests *only* the fake's outcome logic; port interface and signature discipline are covered separately in `providers.test.ts`.
- `keyed()` uses a mutable default (`createdAt = new Date()`); tests that need a specific timestamp must pass the second argument explicitly (as the "adopts an old record" test does).
- `ageFakeRefundKeys` takes milliseconds (the tests pass `25 * 60 * 60_000`), not seconds or ISO strings.
- The `signed()` helper re-exports `signWebhookPayload` from the *real* providers module rather than re-implementing HMAC, so webhook-signature format changes in production will automatically update these fixtures.
