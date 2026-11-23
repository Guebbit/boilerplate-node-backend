---
source: src/modules/payments/tests/integration/intent-provider-ref.test.ts
source_sha256: b2ff37beb2731a17a1bb0a2ddb5324125ef997189375fa54dc48f7594e562580
context_sha256: 00bc4d2c7592efb77fa4075689ede9dd312f48f3593c99867250f40353421672
generated_at: 2026-11-22T06:57:25.836333+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/intent-provider-ref.test.ts

## Purpose
Integration tests for the invariant that a payment holds exactly one provider intent. `paymentService.createIntent` must resume the stored intent by passing its reference to the provider's `prepare`. It must refuse, with a 409, an adapter that opened a second intent. The stray intent is canceled and the row keeps the first one. Without this, a customer could pay an intent no row names, and the webhook would arrive for a reference nobody holds.

## Key elements
- `setupTestDb()` is called at module level to set up the test database. An `afterEach` hook runs `jest.restoreAllMocks()` to undo the spies.
- `anOrder()` is a local helper. It creates a user, a product priced `'25.00'`, and an order with 2 of that product. It returns `{ user, orderId }`.
- Three tests in the `describe('a second ask for the same payment')` block:
  - **Resume:** `createIntent` is called twice. The first `prepare` call receives no reference. The second receives the `providerRef` stored on the row.
  - **Different intent:** `prepare` is mocked to return `pi_1`, then `pi_2`, and `cancel` is mocked. The second call is rejected with status 409 and code `PAYMENT_IN_FLIGHT`. `cancel` is called once with `'pi_2'`. The row still holds `pi_1`.
  - **Race:** two concurrent first-time `createIntent` calls run via `Promise.all`. Exactly one is refused with `PAYMENT_IN_FLIGHT`. `cancel` is called once, for whichever of `pi_1` or `pi_2` the row did not keep.

## Relationships
- `paymentService` (`payments/services`) is the unit under test, via `createIntent(orderId, caller)`.
- `paymentRepository` (`payments/repository`) is used for `findByOrderId`, to read the stored `providerRef`.
- `fakePaymentProvider` (`scenarios/support/doubles/payments/fake.ts`) is the provider double. Its `prepare` and `cancel` methods are spied on or mocked.
- `createUser`, `createProduct`, and `createOrder` / `toOrderItem` come from the users, products, and orders `tests/factories` modules. They build the fixtures.
- `asCustomer` (`tests/support/callers`) builds the caller identity. `asReject` (`tests/support/response`) narrows a failed result so `status` and `errors` can be asserted.
- `setupTestDb` (`tests/support/setup-test-db`) provides the database lifecycle.

## Notes
- The tests assume `prepare` takes the stored reference as its third argument (`mock.calls[n][2]`).
- The race test relies on no `Idempotency-Key` being used. Both calls see a row with no reference yet, so neither is serialised. Which call wins is not fixed, so the cancel assertion is computed from the stored `providerRef`.
- Failures are returned as results with a `success` flag, not thrown. The tests check `answer.success` and use `asReject`.
