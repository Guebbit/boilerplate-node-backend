---
source: src/modules/payments/providers/fake.ts
sha256: 87c914075a6469aca54c5d5db5006b00fe45896223b8c1a610f3f60d62bd7cb8
generated_at: 2026-09-23T19:19:18.400481+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/fake.ts

## Purpose

A stub payment-service-provider (PSP) that mirrors the shape of a real provider—returning intent references, async states, and signed webhooks—without ever calling an external service. It exists so demos, e2e suites, and integration tests can exercise the full 3-D Secure and webhook flows without a live PSP account.

## Key elements

- **`fakePaymentProvider`** (exported) — The `PaymentProvider` implementation. Methods:
    - `prepare` — Derives an idempotent `providerRef` (`fake_pi_<paymentId>`) and an HMAC-based `clientSecret`; resolves immediately.
    - `confirm` — Looks up `paymentMethodRef` in `TEST_METHODS` (or falls back to a generic success), records the settle outcome in `outcomes`, returns the current state.
    - `retrieve` — Returns the stored settle outcome, or `processing` for any unknown reference.
    - `refund` — Deletes the entry from `outcomes`; resolves void.
    - `parseWebhook` — Verifies the signature via `verifyWebhookSignature`, parses JSON, validates `id` and `status`, and assembles the flat wire body into the service's `ProviderPaymentState` shape.
- **`TEST_METHODS`** (module-level const) — Maps three known `pm_card_*` references to their immediate and settled states (declined, requires_action→succeeded, processing→succeeded).
- **`FAKE_SUCCESS_METHOD`** / **`FAKE_DECLINE_METHOD`** (exported constants) — The default success (`pm_card_visa`) and the one decline (`pm_card_declined`) reference strings for test panels.
- **`isProviderPaymentStatus`** — Type guard backed by the `PROVIDER_PAYMENT_STATUSES` set; rejects arbitrary or future status strings before they reach `settlePayment`.
- **`outcomes`** (module-level `Map`) — In-memory store of confirmed intent outcomes so `retrieve` can answer without re-deciding.
- **`lastFourOf`** — Extracts trailing four digits from a method reference, defaulting to `'4242'`.

## Relationships

- **`@infrastructure/adapters/logger`** — Every provider method logs an `[fake-psp]` info line so the stub is observable in the same way a real PSP integration would be.
- **`./index`** — Source of the `PaymentProvider`, `ProviderPaymentState`, and `ProviderPaymentStatus` types that shape this module's contracts.
- **`./webhook-signature`** — Provides `verifyWebhookSignature` (HMAC verification) and the `WebhookRejected` error used for 400 responses on bad signatures, unparseable JSON, missing `id`, or unknown statuses.
- **`tests/unit/providers.test.ts`** — Unit-tests the provider methods directly against the `PaymentProvider` contract.
- **`tests/integration/service.test.ts`** — Injects `fakePaymentProvider` so the payment service's full lifecycle (prepare → confirm → webhook → settle) is exercised end-to-end.

## Notes

- `outcomes` is intentionally in-memory. A process restart or a second worker loses all recorded intents; `retrieve` compensates by returning `processing` (the only state that triggers no settlement) for unknown references.
- `prepare` and `clientSecret` are derived (HMAC) from the `providerRef` rather than random, making repeated calls idempotent and ensuring a browser already holding the secret is not invalidated by a double-click.
- The `Stryker disable/restore` comments around logger calls are intentional: mutation testing must not kill the log lines (they carry no logic), so they are excluded from coverage.
- `parseWebhook` is written as a `.then` chain inside `Promise.resolve()` rather than `async/throw`, so a synchronous throw (e.g. from `JSON.parse`) lands in the rejection path and is caught by the module's own `.catch`, avoiding a dual failure mode (sync throw + rejection) that would force callers to both `try/catch` and `.catch`.
- The webhook body shape (`PaymentWebhookEventBody`) is flat by design; a real provider adapter would translate its own nested event into the same `ProviderPaymentState` the service reads.
