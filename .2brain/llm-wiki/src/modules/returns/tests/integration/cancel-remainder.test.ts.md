---
source: src/modules/returns/tests/integration/cancel-remainder.test.ts
sha256: 352aadfb2b7914195cfdfcf3ee55edae670551dd596ec295eb1ca7831f465c87
generated_at: 2026-11-14T21:42:59.266219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/cancel-remainder.test.ts

## Purpose

Integration test for the "cancel remainder" flow: a buyer cancels the unshipped portion of a partially-shipped order (a Return of `kind: 'cancellation'`). Verifies that stock restoration, refund issuance, fulfillment-order closure, and order-status transitions all commit together, and that edge-case rejections (wrong reason, explicit lines, missing fulfillment order) are enforced.

## Key elements

- **`partlyShipped(mugOverrides?, madeDaysAgo?)`** — Primary fixture. Creates a paid order with 2 shirts (30.00) + 1 mug (10.00) + 5.00 delivery, ships only the shirts via `deliveryService`, leaving the mug as the cancellable remainder.
- **`paidMixed(mugOverrides?, status?, madeDaysAgo?)`** — Lower-level fixture: creates user, products, order, reserves inventory, and confirms a card payment. Used by `partlyShipped`.
- **`buyerCancels(fixture)`** — Calls `returnService.createReturn` with `kind: 'cancellation'`, the correct reason, and the fulfillment-order ID.
- **`created(outcome)`** — Unwraps a `createReturn` result; throws on failure.
- **`returnShippedGoods(fixture, reason?)`** — Opens a goods-return for the *shipped* lines (for multi-step scenarios where a goods return is followed by a cancellation).
- **`refundsOf(orderId)`** — Reads the refund list from `paymentService.getForOrder` and returns `{ reason, amount }` pairs.
- **`returnNotices()`** — Inspects mocked `enqueueEmail` calls for the `returns.notice` template.
- **`describe('the buyer cancelling what has not shipped', …)`** — The main suite covering:
  - Cancellation writes a closed return, refunds only the unshipped line (10.00), and restores stock counters.
  - Refund is stamped with `withdrawalRefundDueBy` (shop-day + 14 days).
  - Fulfillment order closes; order moves to `shipped` while a shipment is still out.
  - Order jumps to `delivered` when all shipments had already arrived; `withdrawUntil` window starts from the cancel.
  - Rejection: non-withdrawal reason, explicit `lines` array, missing `fulfillmentOrderId`, and a goods-return naming a fulfillment order.
- **`describe` blocks for delivery-fee refund, access control, and options-quotient parity** (truncated in the visible portion but implied by the module doc).

## Relationships

- **`src/modules/delivery/index.ts`** — Exports `deliveryService`, used in the fixture to ship the shirt line so the order becomes partially fulfilled.
- **`src/modules/delivery/services/index.ts`** — Service-layer entry point for delivery operations exercised by the test.
- **`src/modules/delivery/tests/factories.ts`** — Provides `fulfillmentOrdersOf`, `deliverEverything`, and `shipmentsOf` for reading fulfillment state and simulating delivery completion in assertions.
- **`src/modules/inventory/index.ts`** — Exports `inventoryService`, used in the fixture to reserve stock before payment.
- **`src/modules/inventory/services/index.ts`** — Service-layer entry point for inventory operations.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `forceOrderStatus`, `readOrder`, `setWithdrawUntil`, `timelineOf`, and `toOrderItem` for building and inspecting order state.
- **`src/modules/orders/index.ts`** — Exports `withdrawUntilFrom` and `withdrawalRefundDueBy` (re-exported from `src/modules/orders/domain/withdrawal.ts`) used to compute the expected refund deadline.
- **`src/modules/orders/domain/withdrawal.ts`** — Domain logic for withdrawal deadlines and refund due-dates.
- **`scenarios/support/doubles/payments/fake.ts`** — Provides `fakePaymentProvider`, the in-process payment double registered via `paymentsModule`; exercises the full intent → confirm → refund path.
- **`src/infrastructure/adapters/mailer.ts`** — Provides `enqueueEmail`, which is mocked at module scope so the test can assert on queued notifications without sending.
- **`src/infrastructure/observability/audit.ts`** — Provides `registerAuditSink` and the `AuditEntry` type for collecting and asserting audit log entries.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` isolates event-bus state between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes outbox messages so side-effects are visible to assertions.
- **`src/kernel/access/tenant.ts`** — Exports `DEPLOYMENT_TENANT_ID` for tenant-scoped setup.
- **`src/modules/access/tests/factories.ts`** — Provides `seedMembership` to grant role/tenant access for staff-side calls.

## Notes

- Runs against a **real database** (`setupTestDb`) with the **fake payment provider** — no HTTP, no external services. The payment provider is in-process but exercises the full intent→confirm→refund path.
- The module-level docstring pins the invariants this test guards: lines + stock + order summary + Return row commit atomically; delivery fee refunds **only** on the cancel/return that takes the last unit (never twice); buyer and staff endpoints differ in permissions under the same refund key; and `GET /returns/options` must quote exactly what the cancel refunds.
- `partlyShipped` ships *only* the shirt line; the mug line on the fulfillment order gets `canceledQuantity: 1, shippedQuantity: 0` after the cancel.
- The `customers` counter increments per `paidMixed` call to guarantee unique emails across tests in the same file.
- The mailer mock is module-scoped (`jest.mock`), so `returnNotices()` filters by the `returns.notice` template name from all `enqueueEmail` calls.
