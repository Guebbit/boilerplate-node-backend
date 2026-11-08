---
source: src/modules/payments/tests/integration/intent-provider-ref.test.ts
sha256: b2ff37beb2731a17a1bb0a2ddb5324125ef997189375fa54dc48f7594e562580
generated_at: 2026-11-08T07:32:52.157699+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/intent-provider-ref.test.ts

## Purpose

Integration test verifying the single-intent invariant for a payment row: `createIntent` must resume the stored provider reference on repeat calls, and must reject (409) and cancel any stray intent the adapter opens instead. It exists to guard against a customer paying an intent the database does not name, which would orphan a subsequent webhook.

## Key elements

- **`anOrder()`** — async helper that creates a fresh user, a product (price 25.00), and a 2-item order; returns `{ user, orderId }` for each test.
- **`describe('a second ask for the same payment')`** — the single test block containing three cases:
  - *Resumes the stored reference* — calls `createIntent` twice, asserts the second call passes the stored `providerRef` as the third arg to `prepare`.
  - *Refuses a different intent (409 + cancel)* — mocks `prepare` to return a new ref each call; asserts the second response is 409 / `PAYMENT_IN_FLIGHT`, `cancel` is called on the stray, and the row still holds the first ref.
  - *Racing first-time asks* — fires two concurrent `createIntent` calls (no Idempotency-Key); asserts exactly one succeeds, the loser's stray is canceled, and the stored ref is the winner's.
- **`setupTestDb()`** — provisions a real database for the suite; `afterEach` restores all jest mocks.

## Relationships

- **`src/modules/payments/services/index.ts`** — source of `paymentService.createIntent`, the method under test.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` is used to inspect the persisted `providerRef` after each scenario.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` supplies the adapter whose `prepare` and `cancel` methods are spied on and, in two cases, replaced with a mock implementation that returns incrementing refs.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** — factory helpers consumed by `anOrder()` to build the prerequisite entities.
- **`tests/support/callers.ts`** — `asCustomer` wraps the caller identity passed to `createIntent`.
- **`tests/support/response.ts`** — `asReject` extracts status and error codes from a rejected response object.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database before the suite runs.

## Notes

- This is a **real-database** integration test (uses `setupTestDb`), not an in-memory unit test. The repository read/write path is exercised for real.
- The third test deliberately omits an Idempotency-Key so that both concurrent requests observe "no stored reference yet," isolating the race between the service's check-and-set logic and the provider call.
- The fake provider's `prepare` is called with the stored ref as its **third** positional argument (index 2) — the test asserts against `mock.calls[n][2]`.
