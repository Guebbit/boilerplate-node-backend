---
source: tests/integration/journeys/the-provider-disagrees.test.ts
sha256: 2183f4a00405f620fbfb94881b32dc55e747915789b317951f50042de3d88ab2
generated_at: 2026-11-08T09:41:20.320386+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/the-provider-disagrees.test.ts

## Purpose

Integration test exercising three failure/divergence scenarios where the payment provider's state disagrees with the server's: wrong settlement amount, a refund the provider refuses, and a payment the provider completes without the server ever seeing a confirm. Each scenario verifies the system converges to a correct, consistent state (no leaked money, no misplaced stock, no duplicate side-effects).

## Key elements

- **`providerRef(paymentId)`** – Builds the fake provider's internal reference string (`fake_pi_<id>`) used as the key for every lever call.
- **`describe('the provider reports the wrong amount')`** – Seeds a 1¢-short receipt via `setFakeReceipt`, confirms the card, asserts a 409, canceled order, full refund, restored stock, no "payment-received" mail, and an `amount_mismatch` audit entry.
- **`describe('the provider refuses a refund')`** – Uses `setFakeRefundFailure` to make the first refund fail, then advances the clock past `NODE_PAYMENT_REFUND_RETRY_MINUTES` and drains the `sweep:payment-effects` worker. Asserts the sweep retries with the **same idempotency key** (exactly 2 refund calls) and final state is fully refunded.
- **`describe('the provider settles a payment behind the server's back')`** – Confirms with a 3DS `authentication_required` result, then injects a `succeeded` outcome via `setFakeOutcome` and calls the `/payments/:id/sync` endpoint. Asserts paid-once, mailed-once, stock reserved (not consumed), and no refund.
- **`afterEach`** – Restores real timers and all jest mocks after every test.
- **`beforeEach(useOutboxMail)`** – Captures outbound mail per test for assertions.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Provides `fakePaymentProvider`, `setFakeReceipt`, `setFakeRefundFailure`, `setFakeOutcome`; the levers that let this test steer provider behaviour.
- **`tests/support/journey-orders.ts`** – Supplies the high-level order/payment journey steps (`newShopper`, `placeOrder`, `openIntent`, `confirmCard`, `payByCard`, `orderOf`, `paymentOf`, `stockOf`).
- **`tests/support/drain.ts`** – `drain()` flushes queued async work (refunds, mail, sweeps) so assertions run against settled state; `drain('sweep:payment-effects')` targets a specific worker.
- **`tests/support/http.ts`** – `api()` and `authenticateAs` for raw endpoint calls (cancel, sync, audit).
- **`tests/support/body-of.ts`** – `bodyOf` parses and validates response bodies against Zod schemas.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` control the refund-retry age threshold.
- **`tests/support/contract.ts`** – Imported as a side-effect to enable API contract validation across all requests.
- **`tests/support/journey-mail.ts`** – `useOutboxMail` captures mail; `mailsTo` asserts which templates were sent.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` provisions a clean database for the suite.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the fixture product (price, stock) per test.

## Notes

- The idempotency-key assertion in the refund-failure test is the critical guarantee: the sweep must retry with the **same** key so the provider can deduplicate.
- The "behind the server's back" scenario intentionally leaves stock at `reserved: 1` (not `onHand` decremented), reflecting that the order is *paid* but not yet *fulfilled/shipped*.
- `advanceDate(61_000)` is just over 1 minute, matching the `NODE_PAYMENT_REFUND_RETRY_MINUTES` env default; using a smaller value would skip the sweep.
- The `providerRef` helper is local to this file; if other test files need the same convention, they must replicate the `fake_pi_` prefix or import from the fake module.
