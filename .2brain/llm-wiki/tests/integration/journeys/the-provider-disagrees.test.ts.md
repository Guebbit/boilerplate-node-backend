---
source: tests/integration/journeys/the-provider-disagrees.test.ts
sha256: f6076ed11a079acf9a2963f9079789fc3ca3829072be7d7aea04ffbde97a6724
generated_at: 2026-10-29T06:57:58.545197+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/the-provider-disagrees.test.ts

## Purpose

Integration test covering three failure journeys in which the payment provider misbehaves: reporting a wrong settlement amount, refusing a refund, and settling a 3DS challenge without the server ever seeing a confirm. Each journey asserts that no money or stock ends up out of place.

## Key elements

- **`providerRef(paymentId)`** — builds the provider-side reference key (`fake_pi_<id>`) used to address every fake-provider lever.
- **`describe('the provider reports the wrong amount')`** — sets a short receipt via `setFakeReceipt`, confirms the card, then verifies a 409, order cancellation, full refund, stock restored, no payment-received mail, and an `amount_mismatch` audit entry.
- **`describe('the provider refuses a refund')`** — triggers a cancellation with `setFakeRefundFailure`, confirms the refund stays `failed`, advances the clock past `NODE_PAYMENT_REFUND_RETRY_MINUTES`, drains `sweep:payment-effects`, and asserts the retry used the **same idempotency key** and that stock is restored.
- **`describe('the provider settles a payment behind the server's back')`** — simulates a 3DS challenge completing externally, calls `POST /payments/:id/sync`, then verifies the order is `paid`, stock is reserved (not refunded), exactly one payment-received mail is sent, and `amountRefunded` is 0.
- **`setupTestDb()` / `beforeEach(useOutboxMail)` / `afterEach(restoreMocks + realTimers)`** — per-test isolation.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — source of `fakePaymentProvider`, `setFakeOutcome`, `setFakeReceipt`, `setFakeRefundFailure`; the entire test drives behavior through these levers.
- **`scenarios/support/doubles/payments/levers.ts`** — underpins the fake's lever mechanism (referenced indirectly via the fake's setters).
- **`tests/support/journey-orders.ts`** — provides the full order-lifecycle helpers (`newShopper`, `placeOrder`, `openIntent`, `confirmCard`, `payByCard`, `orderOf`, `paymentOf`, `stockOf`).
- **`tests/support/http.ts`** — `api()` for raw HTTP calls (cancel, sync, audit) and `authenticateAs` for role-based tokens.
- **`tests/support/drain.ts`** — `drain()` flushes pending async jobs; `drain('sweep:payment-effects')` targets the refund-sweep queue specifically.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` control the clock so the sweep retry window (1 min) can be crossed deterministically.
- **`tests/support/body-of.ts`** — `bodyOf` parses and Zod-validates each HTTP response.
- **`tests/support/journey-mail.ts`** — `useOutboxMail` (beforeEach) enables mail capture; `mailsTo` asserts on delivered messages.
- **`tests/support/contract.ts`** — imported for side-effect: registers global Zod contract assertions.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product with a known price and stock count.
- **`tests/support/setup-test-db.ts`** — initialises the in-memory test database before the suite runs.

## Notes

- All three scenarios key their levers through `providerRef`, which prefixes the internal payment/intent ID with `fake_pi_`. Forgetting this prefix means the lever silently no-ops.
- The sweep test depends on the env var `NODE_PAYMENT_REFUND_RETRY_MINUTES` defaulting to **1 minute**; the clock is advanced by 61 s (not 60) to stay safely past the threshold.
- `drain('sweep:payment-effects')` must be used (not bare `drain()`) in the refund-refusal test, because the retry is enqueued on a specific named queue.
- The idempotency-key assertion (`keys[0] === keys[1]`) is the core guarantee of the refund sweep: the provider is called twice but with the same key so it cannot double-credit.
- The 3DS "behind the back" scenario intentionally passes `'pm_card_authentication_required'` to `confirmCard` to put the intent into a challenge-waiting state before the sync.
