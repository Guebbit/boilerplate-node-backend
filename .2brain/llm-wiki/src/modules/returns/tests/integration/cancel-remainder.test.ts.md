---
source: src/modules/returns/tests/integration/cancel-remainder.test.ts
sha256: f72eb0551c93f747f5e08c3bb9151e2b86a2ef6be6951ccfd133940bcd453a0a
generated_at: 2026-10-15T11:59:23.183463+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/cancel-remainder.test.ts

## Purpose

Integration test that verifies the "cancel the unshipped remainder" flow end-to-end against a real database and the fake payment provider. It pins the invariants around a `kind: 'cancellation'` Return: atomic commit of lines/stock/summary/Return row, refund amount (lines only, plus delivery only on the last unit), role-based access for buyer vs. staff, and the `GET /returns/options` quote matching the actual refund.

## Key elements

- **`partlyShipped()`** – Fixture helper. Creates a paid, processing order with 2 shirts (shipped) and 1 mug (unshipped remainder), reserving stock and confirming a fake card payment. Returns handles for user, products, order, and fulfillment order.
- **`buyerCancels(fixture)`** – Wraps `createReturn` with `kind: 'cancellation'` for the fixture's fulfillment order, as the owning customer.
- **`created(outcome)`** – Asserts a `createReturn` result is `'created'`; throws otherwise.
- **`returnShippedGoods(fixture, reason)`** – Staff-side path: create a goods Return, approve (if not withdrawal), and receive it. Used to set up the "shipped goods come back" scenario.
- **`refundsOf(orderId)`** – Reads payment records and extracts the list of `{ reason, amount }` refunds.
- **`describe('the buyer cancelling what has not shipped')`** – Contains the test cases:
  - Closed cancellation with correct lines, refund amount, and inventory counters restored.
  - Fulfillment order closed, order status → `shipped`, `remaining: 0`.
  - All shipments already delivered → order becomes `delivered`, `withdrawUntil` set from the cancel moment.
  - Rejection cases: non-withdrawal reason, explicit `lines`, missing `fulfillmentOrderId`, goods-return naming a single line → all `RETURN_CANCELLATION_INVALID`.
  - 409 `RETURN_NOTHING_TO_CANCEL` when nothing has shipped yet (whole-order cancel path instead).
  - 409 on a second cancel (no remainder remains); refund issued exactly once.
  - 409 after the withdrawal window has expired; no Return row written.

## Relationships

- **`src/kernel/events.ts`** – `resetDomainEvents()` called in `afterEach` to isolate domain-event assertions between tests.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` imported (outbox nudges flushed during the test lifecycle).
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` used to scope caller contexts.
- **`src/modules/access/index.ts`** – `assignRole` imported for staff-role setup in tests.
- **`src/modules/delivery/index.ts`** – `shipFulfillmentOrder` (to ship the shirts in the fixture) and `runPreorderSweep` imported.
- **`src/modules/delivery/tests/factories.ts`** – `deliverEverything`, `fulfillmentOrdersOf`, `shipmentsOf` used to read/advance delivery state.
- **`src/modules/inventory/index.ts`** – `inventoryService.reserveForOrder` called in the fixture to hold stock.
- **`src/modules/orders/index.ts`** – `withdrawUntilFrom` imported to compute the expected 30-day window assertion.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `forceOrderStatus`, `readOrder`, `setWithdrawUntil`, `timelineOf`, `toOrderItem` used to build and inspect order state.
- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider` is the payment adapter that records intents/refunds in-memory for assertions.

## Notes

- The mailer is mocked (`jest.mock('@infrastructure/adapters/mailer')`) so no email side-effects leak between tests.
- `registerCheckoutModules` is called in `beforeEach` to wire `paymentsModule` and `returnsModule` into the test DI container; `resetDomainEvents` + `jest.restoreAllMocks` in `afterEach` keep isolation.
- The `customers` counter at module level ensures each test run gets a unique email, avoiding collisions in the real DB.
- The file is truncated in the snapshot; additional test cases (e.g., delivery-fee-on-last-unit, `GET /returns/options` parity, role-gating) are declared in the module docblock but their implementations follow after the visible portion.
