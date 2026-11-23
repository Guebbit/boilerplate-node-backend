---
source: src/modules/returns/tests/integration/cancel-remainder.test.ts
source_sha256: 5e59cb68613e2afc9e0d2c2489f7e1136061b3637f04d15039af96ffab126a3d
context_sha256: c336f7cebe3c47e181c2f5265ea5cc254bccd4e2d6140caa2ba178e97deb4469
generated_at: 2026-11-22T07:33:30.751889+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/cancel-remainder.test.ts

## Purpose
Integration test suite for cancelling the unshipped remainder of an order as a Return of `kind: cancellation`, created already closed. It runs against a real test database and the real `fake` payment provider. It pins four things: lines, stock, order summary and the Return row commit together. Money refunded is the canceled lines, plus delivery only when the cancel (or return) takes the last unit, and never twice. The buyer's route and staff's route (under the refund key) differ in who may use them. What `GET /returns/options` quotes matches what the cancel then refunds.

## Key elements
- `mockEnqueueEmail` / `returnNotices()` – `jest.mock` of `@infrastructure/adapters/mailer`; `returnNotices()` filters calls to the `returns.notice` template.
- `partlyShipped(mugOverrides, madeDaysAgo)` – builds a 75.00 card-paid order (2 shirts at 30.00, a mug at 10.00, 5.00 delivery) via `paidMixed`, then ships only the shirts through `deliveryService.shipFulfillmentOrder`, leaving the mug as the remainder. Returns `user`, `shirt`, `mug`, `orderId`, `fulfillmentOrderId`.
- `paidMixed(mugOverrides, status, madeDaysAgo)` – the same order before anything ships. It reserves stock, creates and confirms a payment intent with `pm_card_visa`, and forces the order status. A `noWithdrawal` mug gets its own fulfillment order.
- `Fixture` – type alias of `partlyShipped`'s result.
- `buyerCancels(fixture)` – `returnService.createReturn` with `reason: 'withdrawal'`, `kind: 'cancellation'` and the fulfillment order id, as the customer.
- `created(outcome)` – unwraps a successful outcome and throws on a refusal.
- `returnShippedGoods(fixture, reason)` – creates a return for shipped goods, approves it if the reason isn't `withdrawal`, then receives it as admin.
- `refundsOf(orderId)` – the payment's refunds as `{ reason, amount }` pairs.
- `describe('the buyer cancelling what has not shipped')` – the visible cases cover:
  - a closed cancellation with a 10.00 refund and the mug's units returned to stock (the shirts stay out of the shelf count);
  - a cancellation still created closed when the payment has nothing left, which emits a `payment.return_refund_short` outbox fact with `opened: '0.00'`;
  - the refund stamped with `dueRule: 'withdrawal'` and `dueBy` from `withdrawalRefundDueBy`;
  - the fulfillment order closed and the order moved to `shipped` with `remaining: 0, undelivered: 1`;
  - the order becoming `delivered` when all shipments had already arrived, with `withdrawUntil` counted from the cancel;
  - refusals for a non-withdrawal reason, named lines, or a missing fulfillment order.

## Relationships
- `scenarios/support/doubles/payments/fake.ts` – supplies `fakePaymentProvider`, the real fake provider the payment flow runs against.
- `src/infrastructure/adapters/mailer.ts` – `enqueueEmail` is replaced with a Jest mock to assert queued mail.
- `src/infrastructure/observability/audit.ts` – `registerAuditSink` and `AuditEntry` are imported so audit entries can be captured.
- `src/kernel/access/tenant.ts` – `DEPLOYMENT_TENANT_ID` is imported.
- `src/kernel/events.ts` – `resetDomainEvents` is called in `afterEach`.
- `src/kernel/outbox.ts` – `outboxEventModel` is queried for outbox facts; `settleOutboxNudges` is imported.
- `src/modules/access/tests/factories.ts` – `seedMembership` is imported for setting up staff access.
- `src/modules/delivery/index.ts` and `src/modules/delivery/services/index.ts` – `deliveryService` ships the fulfillment order.
- `src/modules/delivery/tests/factories.ts` – `deliverEverything`, `fulfillmentOrdersOf` and `shipmentsOf`.
- `src/modules/inventory/index.ts` and `src/modules/inventory/services/index.ts` – `inventoryService` is imported from the inventory module and is used to hold the units when arranging orders.
- `src/modules/orders/domain/withdrawal.ts` and `src/modules/orders/index.ts` – `withdrawUntilFrom` and `withdrawalRefundDueBy` supply the expected dates.
- `src/modules/orders/tests/factories.ts` – `createOrder`, `forceOrderStatus`, `readOrder`, `setWithdrawUntil`, `timelineOf` and `toOrderItem`.
- Also uses the sibling `../../module`, `../../services` (`returnService`) and `../../repository`, plus factories and services from users, products, payments and shop.

## Notes
- `setupTestDb()` runs at module level. `beforeEach` registers `paymentsModule` and `returnsModule` through `registerCheckoutModules`. `afterEach` resets domain events and restores mocks.
- `customers` is a module-level counter that gives each fixture a distinct email (`cancel-N@example.com`).
- Several imports are not used in the visible part of the file (e.g. `asModerator`, `asRole`, `asWarehouse`, `withEnvironmentOverrides`, `seedMembership`). They are presumably used by later cases, which are not shown here.
