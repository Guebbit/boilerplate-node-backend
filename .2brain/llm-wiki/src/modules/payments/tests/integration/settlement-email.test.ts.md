---
source: src/modules/payments/tests/integration/settlement-email.test.ts
source_sha256: 6b8bc0a60fddf0c7b6d57bbbe6e2cac66d01a799ecb670c68bf070217f121515
context_sha256: 02bc34c3058849bb9c79ab2297e6a1e532a79e72e4b983cf4847b73cf054c6f0
generated_at: 2026-11-22T07:02:20.586776+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/settlement-email.test.ts

## Purpose
Integration test pinning that a payment settling to `succeeded` emails the buyer a "payment received" message (template `payments.payment-received`). The placed-order confirmation only says the order was received, so this mail is the paid notice. It asserts the mail is sent only on the write that actually commits stock, never on a decline or on a retry of an already-settled payment.

## Key elements
- `mockEnqueueEmail`: the mocked `enqueueEmail` (module mocked via `jest.mock`), standing in for the mail queue; tests inspect which templates were enqueued.
- `GOOD_METHOD` (`pm_card_visa`): opaque payment-method reference used for successful confirms.
- `orderFor()`: creates a user, a product priced `25.00`, and an order with one item.
- `paidMailSent()`: true if any enqueued mail used the `payments.payment-received` template.
- Test cases:
  - Successful confirm: mail is enqueued, with `envelope.to` equal to `order.email`.
  - Decline (`FAKE_DECLINE_METHOD`): no payment-succeeded mail.
  - Second `confirmPayment` on an already-succeeded payment: still exactly one mail.

## Relationships
- `@tests/setup-test-db` (`setupTestDb`): provides the real Mongo test database.
- `@infrastructure/adapters/mailer`: `enqueueEmail` is replaced with a jest mock.
- `@modules/users`, `products`, `orders` test factories: seed the user, product, and order.
- `@modules/payments/services` (`paymentService`): `createIntent` and `confirmPayment` are the code under test.
- `@modules/payments/module` and `@tests/checkout-modules` (`registerCheckoutModules`): register the payments module before each test.
- `@scenarios/support/doubles/payments/fake`: supplies `FAKE_DECLINE_METHOD` to trigger a decline.
- `@kernel/events` (`resetDomainEvents`): clears domain event registrations after each test.
- `@kernel/outbox` (`settleOutboxNudges`): flushes pending outbox work before absence assertions.
- `@tests/callers` (`asCustomer`, `testCallerContext`): caller identity and context for service calls.
- `@tests/eventually`: polls until the mail has been enqueued.

## Notes
- The mail send is fire-and-forget and begins with a real Mongo read, so positive assertions use `eventually(paidMailSent)` rather than awaiting a single tick.
- Absence assertions (decline, retry) have nothing to wait on, so they call `settleOutboxNudges()` to give any stray mail a chance to appear before asserting.
- The retry case relies on `SETTLEABLE_PAYMENT_STATUSES` excluding `succeeded`, so the second confirm settles nothing new.
- `beforeEach` clears the mock and re-registers modules; `afterEach` resets domain events and restores mocks.
