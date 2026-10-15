---
source: src/modules/payments/tests/integration/intent-provider-ref.test.ts
sha256: e5206ac5af9e2f73a111d74227e17698065b02268ef6aee4e4fc181051c0430f
generated_at: 2026-10-15T11:33:46.885274+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/intent-provider-ref.test.ts

## Purpose

Integration tests verifying the single-intent-per-payment invariant: `createIntent` must resume the provider reference already stored on the payment row, and must reject (409) + cancel any stray intent the provider accidentally opens on a subsequent or racing call.

## Key elements

- **`anOrder()`** — async helper that creates a fresh user, a product priced at 25, and an order with one line item; returns `{ user, orderId }`.
- **`describe('a second ask for the same payment')`** — the single suite containing three cases:
  - *Resumes the stored reference* — calls `createIntent` twice, asserts the second `prepare` call receives the `providerRef` persisted by the first.
  - *Refuses a divergent provider intent* — mocks `prepare` to return a new ref each time; asserts the second call yields 409 / `PAYMENT_IN_FLIGHT`, `cancel` is called on the stray ref, and the row keeps `pi_1`.
  - *Races two first-time asks* — fires two concurrent `createIntent` calls via `Promise.all` (no Idempotency-Key); asserts exactly one is refused with `PAYMENT_IN_FLIGHT` and the loser's intent is cancelled.

## Relationships

- **`setup-test-db.ts`** — initialises a real test database (this is an integration test, not a unit test).
- **`services/intent.ts` / `services/index.ts`** — exports the `createIntent` function under test.
- **`repository.ts`** — `paymentRepository.findByOrderId` is used to assert the persisted `providerRef` after each scenario.
- **`fake.ts` (doubles)** — `fakePaymentProvider.prepare` and `.cancel` are spied/mocked to control which refs the "provider" returns and to verify cancellation.
- **`callers.ts` / `response.ts`** — `asCustomer` builds the caller context; `asReject` extracts status and error codes from a failed response.
- **`users/tests/factories.ts`, `products/tests/factories.ts`, `orders/tests/factories.ts`** — create the prerequisite user, product, and order rows.

## Notes

- The race test deliberately omits an Idempotency-Key so both requests observe "no reference yet" in the row; correctness depends on the service-layer write-then-check logic, not HTTP-level deduplication.
- `afterEach` calls `jest.restoreAllMocks()`; all spies in these tests are per-test and never leak.
- The fake's `prepare` is spied (not replaced) in the first test to inspect call arguments, but fully mocked in tests 2–3 to return deterministic sequential refs (`pi_1`, `pi_2`, …).
