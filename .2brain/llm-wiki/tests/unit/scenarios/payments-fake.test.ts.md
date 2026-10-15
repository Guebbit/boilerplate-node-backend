---
source: tests/unit/scenarios/payments-fake.test.ts
sha256: 72fa60b840f17bb5dccacd58acce56dc1abd2abf893da4e9ff9cd8c7974424eb
generated_at: 2026-10-15T13:24:49.832668+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/payments-fake.test.ts

## Purpose
Unit tests for the fake payment-service-provider test double (`fakePaymentProvider`). Validates that the fake's prepare → confirm → retrieve lifecycle, refund, cancel, and webhook-parsing behave predictably and safely so that downstream scenario tests can rely on deterministic outcomes without a real PSP, database, or network.

## Key elements

- **`fakePaymentProvider.prepare` tests** — Reference is derived from the payment intent (idempotent re-prepare), different payment IDs yield different refs, `clientSecret` is distinct from `providerRef`.
- **`fakePaymentProvider.confirm` tests** — Each documented method reference maps to a specific status (`declined`, `requires_action`, `processing`, `succeeded`); card last-4 is extracted from the method string.
- **`fakePaymentProvider.retrieve` tests** — Returns the *settled* status (not the initial confirm status); lever-set outcomes (`setFakeOutcome`) are readable without a prior confirm; unknown refs resolve to `processing` (the only status that moves no money).
- **`fakePaymentProvider.refund` tests** — Always succeeds; same idempotency key yields the identical `refundRef`.
- **`fakePaymentProvider.cancel` tests** — Idempotent (double-cancel is fine); allowed after decline; **rejected** with `PaymentInFlightError` once the intent has succeeded.
- **`fakePaymentProvider.parseWebhook` tests** — Accepts a correctly signed body; rejects unsigned, non-JSON, non-object, missing-id, oversized-field, operator-object, and extra-field bodies (all throwing `WebhookRejected`); accepts an event with no `providerRef`.
- **Success-reporting tests** (`amountReceived` / `currency` / `paymentId`) — Confirmed success reports the prepared charge fields; `setFakeReceipt` can override `amountReceived`; non-success states carry no monetary fields; unprepared intents report `undefined` for money fields.
- **`prepared(suffix)` helper** (local, not exported) — Prepares a 50 EUR intent on `pay_<suffix>` and returns the `providerRef` for subsequent confirm/retrieve assertions.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — The system under test. This file imports `fakePaymentProvider`, `setFakeOutcome`, `setFakeReceipt`, `FAKE_DECLINE_METHOD`, and `FAKE_SUCCESS_METHOD` from there.
- **`src/modules/payments/providers/errors.ts`** — Source of `PaymentInFlightError` (cancel-after-succeed rejection) and `WebhookRejected` (bad-webhook rejection), both used as assertion targets.
- **`src/modules/payments/providers/index.ts`** — Re-export barrel through which this test imports the error classes and `signWebhookPayload`.
- **`src/modules/payments/providers/webhook-signature.ts`** — Source of `signWebhookPayload`, used to produce valid signatures so that `parseWebhook` can be exercised with correctly-signed but structurally-invalid bodies.

## Notes

- This file tests **only the fake**. Port-contract and signature-verification tests live in `providers.test.ts` (stated in the module docblock).
- Unknown `providerRef` in `retrieve` intentionally resolves to `processing`, not an error — the rationale (comment in-file) is that a restarted process or second worker must answer with a status that moves no money.
- The parameterized `parseWebhook` rejection suite passes **valid signatures** over **invalid payloads**, confirming the fake validates body shape *after* signature check and *before* any state lookup.
- `setFakeOutcome` and `setFakeReceipt` are "levers" injected directly into the fake's internal store; they bypass `confirm` entirely, simulating the situation where a webhook arrives for an intent the current process never prepared.
