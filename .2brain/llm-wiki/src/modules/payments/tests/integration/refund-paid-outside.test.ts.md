---
source: src/modules/payments/tests/integration/refund-paid-outside.test.ts
source_sha256: 1414ad2f697a520155a82efeec9355c905d9dbe402c320417a4e87216c3aaa85
context_sha256: 414a94cd0710b38e6f26e932090520ac0058b2727f587e11029732a00b3d278a
generated_at: 2026-11-22T07:00:00.954790+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-paid-outside.test.ts

## Purpose
Integration test, run against real Mongo through the services' public API, for refunds that staff record as already paid outside the application (`paidOutside`). Such a refund is created already settled by hand: the payment provider is never called, the retry sweep has nothing to send, and no operator to-do is raised. The file also checks that `payment.refunded` is emitted, since `invoicing` issues the credit note from it. The credit note itself is not tested here.

## Key elements
- `jest.mock('@infrastructure/adapters/mailer')`: replaces `enqueueEmail` with `mockEnqueueEmail`, so tests can assert which mail was queued (e.g. `payments.refund-issued`).
- `setupTestDb()`, plus a `beforeEach`/`afterEach` pair. `beforeEach` clears the mail mock, calls `registerCheckoutModules([paymentsModule])`, and registers an audit sink that collects entries into `audited`. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- `newOrder()`: creates a user with a unique email, a 50.00 product and a 2-unit order (100.00 total).
- `cardOrder()`: `newOrder()` plus `payByCard`, then `settleOutboxNudges()`.
- `cashOrder()`: `newOrder()` plus `paymentService.recordOfflinePayment` with method `cash`, as admin.
- `paymentOf(orderId)`: loads the stored payment through `paymentRepository.findByOrderId` and throws if none exists.
- `refundOutside(orderId, amount?, reference?)`: calls `refundOrderPayment` as admin with `paidOutside: { method: 'cash', reference? }`. The amount is optional.
- `settledByHandRows()`: filters the audit entries for the action `admin.payment.refund_settled_by_hand`.
- `describe` "on a card payment" covers these cases:
  - **Born settled:** a 201 response, with the refund `succeeded`, `settledByHand`, and no `providerRefundRef`. `fakePaymentProvider.refund` is never called, and `retryOpenRefunds` does nothing. The order becomes `partially_refunded`, and its timeline gets `refund_issued` then `refund_settled`. One `PAYMENT_REFUNDED` outbox event is written, the buyer is mailed, and one audit row is written.
  - **No amount given:** refunds everything left, and the order reads `refunded` with `full: true`.
  - **Over-refund:** answers 422 `PAYMENT_REFUND_EXCEEDS_REMAINING` and writes nothing.
  - **Racing write:** when `addRefund` returns `null` once, the refund is re-read and retried and still succeeds.
  - **Retries exhausted:** when `addRefund` always returns `null`, it is called 3 times and the answer is 409 `PAYMENT_NOT_REFUNDABLE`, with no record, event or audit row.
  - **Open chargeback:** a dispute set up via `setFakeDispute` and `deliver` gives 409 `PAYMENT_DISPUTED`.
  - **Visibility:** the buyer sees only the method, while staff also see the `reference`.
- `describe` "on a hand-paid payment": the first visible case checks that the refund is settled at once and that no `PAYMENT_REFUND_OWED_BY_HAND` event is produced (the assertion is cut off in the provided content).

## Relationships
- `@modules/payments/services` (`paymentService`) and `@modules/payments/repository` (`paymentRepository`) are the code under test. The repository's `addRefund` is spied on to simulate racing writes.
- `@modules/payments/tests/factories` supplies `payByCard` and `refundOrderPayment`.
- `@modules/payments/tests/deliver` feeds the dispute from `setFakeDispute` through the provider's inbound path.
- `scenarios/support/doubles/payments/fake.ts` supplies `fakePaymentProvider` (spied to prove it is never called) and `setFakeDispute`.
- `@modules/payments/events` supplies `PAYMENT_REFUNDED` and `PAYMENT_REFUND_OWED_BY_HAND`, which are checked in the outbox.
- `@kernel/outbox` supplies `outboxEventModel` and `settleOutboxNudges`. `@kernel/events` supplies `resetDomainEvents`.
- `@modules/payments/module` (`paymentsModule`) is registered through `registerCheckoutModules`.
- `@infrastructure/observability/audit` supplies `registerAuditSink` and `AuditEntry`, used to check the audit rows.
- `@infrastructure/adapters/mailer` is mocked.
- `@modules/orders` (`orderService`) and `@modules/orders/tests/factories` supply the order, its payment status and its timeline (`timelineOf`).
- `@modules/products/tests/factories` supplies `createProduct`.
- `@modules/users/tests/factories` supplies `createUser`.
- `@tests/*` helpers supply the DB setup, callers, response unwrapping and `eventually`.

## Notes
- Mail is delivered asynchronously, so the mail assertion is wrapped in `eventually(...)` and re-settles the outbox on each try.
- The retry-limit test expects `addRefund` to be called 3 times, described in a comment as the first attempt plus two re-reads.
- Amounts are strings (`'30.00'`), compared as strings or via `Number(...)`.
