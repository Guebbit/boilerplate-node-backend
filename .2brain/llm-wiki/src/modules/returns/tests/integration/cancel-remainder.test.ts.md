---
source: src/modules/returns/tests/integration/cancel-remainder.test.ts
sha256: 978933d49aae87b060a30aa2810406dac1937a6f974e340b148c142dbe37d338
generated_at: 2026-11-08T08:07:29.480470+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/cancel-remainder.test.ts

## Purpose

Integration test for the "cancel the remainder" flow: creating a `Return` of `kind: 'cancellation'` against a real database and the fake payment provider to verify that lines, stock counters, the order summary, and the Return row all commit atomically, that delivery fees are refunded only on the cancellation that removes the last unshipped unit, and that buyer and staff access paths are enforced correctly.

## Key elements

- **`paidMixed`** — builds a fully paid, `processing` order with two shirts (30.00) and a mug (10.00) plus 5.00 delivery; reserves inventory, creates and confirms a card payment intent, and forces the order status.
- **`partlyShipped`** — calls `paidMixed`, then ships only the shirt lines via `deliveryService.shipFulfillmentOrder`, leaving the mug as the unshipped "remainder."
- **`buyerCancels`** — convenience wrapper that calls `returnService.createReturn` with `kind: 'cancellation'` and the fulfillment-order ID as the customer caller.
- **`created`** — asserts the outcome is a success (throws with error details otherwise) and returns the Return document.
- **`returnShippedGoods`** — creates, optionally approves, and receives a standard (non-cancellation) return of the already-shipped items.
- **`refundsOf`** — reads the payment record for an order and maps its refunds to `{ reason, amount }` pairs for assertions.
- **`returnNotices`** — inspects the mocked `enqueueEmail` calls to count `returns.notice` mail.
- **Test cases** (under `describe('the buyer cancelling what has not shipped')`):
  - Closed cancellation refunds only the unshipped lines; stock counters are restored.
  - Fulfillment order is closed, order moves to `shipped`, remaining/undelivered are updated.
  - If all shipments had already arrived, order jumps straight to `delivered` and `withdrawUntil` is set.
  - Validation refusals (`RETURN_CANCELLATION_INVALID`): non-withdrawal reason, explicit lines, missing fulfillmentOrderId, or a goods-return that names a fulfillment order.
  - 409 when nothing has shipped (the whole order should be canceled instead).

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` is registered as the payment provider so refunds are recorded in-memory rather than hitting a real gateway.
- **`src/infrastructure/adapters/mailer.ts`** — fully mocked via `jest.mock`; `enqueueEmail` is stubbed so tests can assert on queued `returns.notice` mails without sending anything.
- **`src/kernel/events.ts`** — `resetDomainEvents` is called in `afterEach` to prevent event-bus leakage between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is imported (used to flush outbox-driven side effects before assertions where needed).
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes the test tenant context.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` / `AuditEntry` imported for auditing assertions on access-control decisions.
- **`src/modules/delivery/index.ts` / `src/modules/delivery/services/index.ts`** — `deliveryService.shipFulfillmentOrder` ships the shirt lines in fixtures.
- **`src/modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf`, `deliverEverything`, `shipmentsOf` read and manipulate delivery state for assertions.
- **`src/modules/inventory/index.ts` / `src/modules/inventory/services/index.ts`** — `inventoryService.reserveForOrder` holds units before payment; `countersOf` (from products factories) reads back stock.
- **`src/modules/orders/index.ts`** — `withdrawUntilFrom` computes the expected withdrawal deadline.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `readOrder`, `setWithdrawUntil`, `timelineOf`, `toOrderItem` build and inspect order state.
- **`src/modules/orders/domain/withdrawal.ts`** — domain logic behind the withdrawal window asserted in the "delivered in one go" test.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` sets up user-role bindings for access-control scenarios.

## Notes

- The mailer is the **only** jest-mocked dependency; everything else (DB, payments via `fakePaymentProvider`, delivery, inventory) runs for real, making this a true integration test.
- The `customers` counter ensures each test iteration gets a unique email address to avoid collisions in the shared test database.
- The `partlyShipped` fixture always ships **only** the shirt lines; the mug is intentionally left unshipped so it becomes the "remainder" that the cancellation targets.
- A `noWithdrawal` mug product is mentioned in the `paidMixed` doc-comment as producing its own fulfillment order, but the visible test cases use the default mug.
- The 409 case (nothing shipped) is cut off in the provided excerpt; the file likely contains additional assertions and possibly a second `describe` block for the delivery-fee-on-last-unit rule and the `/returns/options` consistency check described in the module header.
