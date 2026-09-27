---
source: src/modules/payments/providers/fake.ts
sha256: e34618744dbf52b660066bcb0565add701905c12a99cebc65779cc2699343f2e
generated_at: 2026-09-27T15:24:35.413336+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/fake.ts

## Purpose

A stub payment-service-provider (PSP) that implements the full `PaymentProvider` interface without any external network calls. It exists so demos, e2e suites, and integration tests can exercise the 3-D Secure flow, asynchronous settlement states, refund/cancel paths, and webhook signature verification without a real provider account or sandbox.

## Key elements

- **`fakePaymentProvider`** (exported) — The `PaymentProvider` object. Implements `prepare`, `confirm`, `retrieve`, `refund`, `cancel`, and `parseWebhook`. Every call is logged via the shared `logger`.
- **`FAKE_SUCCESS_METHOD`** / **`FAKE_DECLINE_METHOD`** (exported constants) — Well-known `paymentMethodRef` strings (`pm_card_visa`, `pm_card_declined`) that tests and the demo panel use to trigger the happy path or the decline path.
- **`TEST_METHODS`** (module-level) — Maps specific method refs to deterministic outcomes: `pm_card_declined` → declined, `pm_card_authentication_required` → requires_action then succeeds, `pm_card_processing` → processing then succeeds. Any unrecognised ref defaults to `succeeded`.
- **`outcomes` / `cancelledIntents`** (module-level `Map`/`Set`) — In-memory, process-lifetime stores. `outcomes` remembers the settled state per intent so `retrieve` is stable; `cancelledIntents` makes repeated `cancel` calls idempotent. Both are lost on restart.
- **`isProviderPaymentStatus`** (module-level type guard) — Runtime check that a webhook `status` string belongs to the known `ProviderPaymentStatus` union before it can be written to a row.
- **`lastFourOf`** (module-level) — Extracts trailing 4 digits from an arbitrary ref string, defaulting to `'4242'`.
- **`prepare`** — Derives `providerRef` deterministically from `metadata.paymentId` (idempotent by construction) and signs a `clientSecret` with HMAC-SHA256.
- **`parseWebhook`** — Verifies the HMAC signature via `verifyWebhookSignature`, validates JSON, checks for a required `id`, and validates `status` through `isProviderPaymentStatus` before returning the flat adapter shape.

## Relationships

- **`src/modules/payments/providers/index.ts`** — Provides the `PaymentProvider`, `ProviderPaymentState`, and `ProviderPaymentStatus` types that this file implements/uses.
- **`src/modules/payments/providers/webhook-signature.ts`** — Supplies `verifyWebhookSignature` and `WebhookRejected`; called inside `parseWebhook`'s promise chain.
- **`src/modules/payments/providers/errors.ts`** — Supplies `PaymentInFlightError`, thrown by `cancel` when the intent has already succeeded.
- **`src/infrastructure/adapters/logger.ts`** — The shared `logger` used for one `info` line per provider method call.
- **`src/modules/payments/tests/unit/providers.test.ts`** — Unit tests that exercise the exported `fakePaymentProvider` directly (method outcomes, idempotent cancel, webhook validation).
- **`src/modules/payments/tests/integration/service.test.ts`** / **`settlement-email.test.ts`** — Integration tests that inject this provider to walk full service flows (settlement, email triggers) without a live PSP.
- **`tests/integration/refund-retry-webhooks.test.ts`** — Exercises the refund → webhook → settlement cycle using this provider's deterministic outcomes.

## Notes

- **State is in-memory and per-process.** A restart or a second worker loses all `outcomes` and `cancelledIntents`. `retrieve` deliberately returns `processing` for unknown refs so nothing is erroneously settled.
- **`confirm` writes the settled outcome directly** into `outcomes` (not an intermediate `processing`). This means `cancel` after `confirm` will always see `succeeded` (or `declined`) — the `processing` guard in `cancel` is defensive for parity with real providers, not reachable through this stub's own flow.
- **Stryker mutation-testing annotations** (`// Stryker disable … / restore`) surround every `logger` call and the `prepare`/`confirm`/`retrieve`/`refund`/`cancel` bodies, exempting log-only mutations from coverage.
- **`clientSecret` is deterministic** (HMAC of the `providerRef`), so re-preparing the same intent yields the same secret — a deliberate choice to avoid invalidating a secret the browser already holds.
- **Webhook bodies are flat** (`id`, `providerRef`, `status`, `cardLast4`), not nested. The adapter assembles the `ProviderPaymentState` the service expects; a real provider's adapter would do the same from its native nested payload.
