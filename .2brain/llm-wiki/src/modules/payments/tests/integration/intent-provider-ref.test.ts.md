---
source: src/modules/payments/tests/integration/intent-provider-ref.test.ts
sha256: fe66f2fc2290f743d11a3c9e3ebd2031cce73c83447da780ffef38042e2ddfe3
generated_at: 2026-10-29T05:17:04.051613+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/intent-provider-ref.test.ts

## Purpose

Integration test for the invariant that a payment row holds exactly **one** provider intent reference. It verifies that a second `createIntent` call resumes the stored intent (passing its reference to `prepare`) and that the service refuses (409) and cancels any stray intent the provider adapter opened instead.

## Key elements

- **`anOrder()`** — helper that creates a user, a product (price 25), and a 2-item order; returns `{ user, orderId }` for the three tests.
- **`describe('a second ask for the same payment')`** — the suite, containing three cases:
  - *Resumes stored intent* — first call stores a `providerRef`; second call passes that ref as the third argument to `fakePaymentProvider.prepare`.
  - *Refuses a different intent* — mocks `prepare` to return incrementing refs; asserts 409 / `PAYMENT_IN_FLIGHT`, that `cancel` is called on the stray, and that the row still holds `pi_1`.
  - *Race: two first-time asks* — fires two concurrent `createIntent` calls (no idempotency key) via `Promise.all`; asserts exactly one succeeds, the loser is 409, and the loser's intent is cancelled while the winner's ref is stored.
- **`afterEach`** — `jest.restoreAllMocks()` to clean up spies between tests.

## Relationships

- **`src/modules/payments/services/index.ts`** — `paymentService.createIntent` is the unit under test in every case.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` inspects the persisted row after each scenario.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` supplies the `prepare` and `cancel` methods that are spied on and mocked.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots a real database for the integration run.
- **`tests/support/callers.ts`** — `asCustomer(user.id)` builds the caller identity passed to `createIntent`.
- **`tests/support/response.ts`** — `asReject` unwraps the error envelope to read `status` and `errors[].code`.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** — create the user, product, and order fixtures used by `anOrder()`.

## Notes

- This is a **true integration test**: the repository and service run against a real database (via `setupTestDb`); only the external provider is faked.
- The race test (case 3) deliberately omits an Idempotency-Key so both calls see a row with no stored reference, simulating a genuine concurrency gap.
- The reference is always the **third** positional argument to `prepare` (index 2 in `mock.calls`); the first call passes `undefined`/falsy.
- `asReject` is used instead of direct `res.status` checks, keeping the assertion style consistent with the rest of the test suite.
