---
source: src/modules/returns/tests/integration/cancel-remainder.test.ts
sha256: 67e4830325474cb263c39877c05e93c8d8faf799821eef32d5ef78eeb28ee361
generated_at: 2026-10-29T05:46:12.388969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/cancel-remainder.test.ts

## Purpose

Integration test that exercises the "cancel the unshipped remainder" path: a `Return` of `kind: cancellation` created by the buyer is immediately closed, refunds only the unshipped lines plus delivery (attributed to the cancel that takes the last unit), releases inventory, and transitions the order and fulfillment records. Runs against a real test database with the `fake` payment provider to verify the cross-module invariants (lines, stock, order summary, and the Return row all commit together; money is never refunded twice).

## Key elements

- **`partlyShipped`** — fixture that builds a paid order (2 × shirt @ 30, 1 × mug @ 10, 5 delivery), ships only the shirts via `deliveryService.shipFulfillmentOrder`, leaving the mug as the cancellable remainder.
- **`paidMixed`** — lower-level fixture: creates user, products, a paid order in a given status, and reserves inventory for all lines.
- **`buyerCancels`** — calls `returnService.createReturn` with `kind: 'cancellation'`, `reason: 'withdrawal'`, and the specific `fulfillmentOrderId`, as the customer.
- **`created`** — unwraps a success result or throws with the error payload.
- **`returnShippedGoods`** — helper that opens a standard (non-cancellation) return for already-shipped goods, optionally approves it, and receives it back (for the "last unit" delivery-fee attribution test).
- **`refundsOf`** — reads the order's payment record and returns the list of `{ reason, amount }` refunds.
- **`returnNotices`** — inspects the mocked `enqueueEmail` calls for the `returns.notice` template.
- **Test cases** cover: refund amount and stock restoration; fulfillment-order closure and order status shift to `shipped` / `delivered`; withdrawal-window stamp; refusal for invalid reasons, named lines, or missing fulfillment order (all yielding `RETURN_CANCELLATION_INVALID`); and a 409 when nothing has shipped (whole-order cancellation path instead).

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — imported as `fakePaymentProvider`; the payment processor backing all card intents and refunds in this suite.
- **`src/infrastructure/adapters/mailer.ts`** — mocked at module level (`jest.mock`); `enqueueEmail` is spied on to assert buyer/staff notice mail.
- **`src/kernel/events.ts`** — `resetDomainEvents` called in `afterEach` to clear the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` imported (likely used in the truncated portion to flush outbox-driven side-effects before assertions).
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` imported for tenant-scoped setup.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` imported to establish the customer's membership before assertions on access.
- **`src/modules/delivery/index.ts`** — `deliveryService` used to ship the shirts in the fixture.
- **`src/modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf`, `deliverEverything`, `shipmentsOf` used to inspect and advance fulfillment state.
- **`src/modules/inventory/index.ts`** — `inventoryService.reserveForOrder` seeds real stock reservations; `countersOf` (from products) verifies on-hand / reserved / available after the cancel.
- **`src/modules/orders/index.ts`** — `withdrawUntilFrom` used to compute the expected withdrawal deadline; `setWithdrawUntil`, `forceOrderStatus`, `readOrder`, `timelineOf`, `toOrderItem`, `createOrder` from the orders test factories drive order lifecycle.
- **`src/modules/orders/domain/withdrawal.ts`** — the `withdrawUntilFrom` helper originates here (re-exported via the orders index).

## Notes

- The mailer is **fully mocked** (`jest.restoreAllMocks` in `afterEach`); no real email is sent.
- Each `paidMixed` / `partlyShipped` call increments a module-level `customers` counter so every user gets a unique email—important because the test DB persists across tests in the file.
- The `409` test (order with nothing shipped) verifies that a remainder-cancellation request is *rejected* in favor of the whole-order cancellation flow; it does not actually create a cancellation.
- The test file is truncated in the source snapshot; the visible portion ends mid-`it` block, so there may be additional cases (e.g., delivery-fee attribution on the last-unit cancel, staff-vs-buyer role gates) not captured above.
- `registerAuditSink` and the `AuditEntry` type are imported but their usage is not visible in the shown portion—likely in the truncated tail or a helper that was cut.
