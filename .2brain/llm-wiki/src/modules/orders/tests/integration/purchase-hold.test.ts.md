---
source: src/modules/orders/tests/integration/purchase-hold.test.ts
source_sha256: 2fa95e55aa16d77812f6c18df1ac30872cfd0250e32b89ebc056caa85685532f
context_sha256: 049adf45246042b638dcf85bd996e94e285ec7dd1c668d40f7fa1e3c26fa5bef
generated_at: 2026-11-22T06:31:24.946817+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/purchase-hold.test.ts

## Purpose
Integration tests for the orders module's "purchase hold": a pause on a buyer's checkout after repeated cancellations. The hold is driven by the `order.canceled` fact via `orderService.considerPurchaseHold`. The tests pin these rules: only the buyer's own cancels count, the hold is placed once, staff are notified once, and a staff lift restarts the count. See `src/modules/orders/model.ts`.

## Key elements
- **`jest.mock` of `@infrastructure/adapters/mailer`**: replaces `enqueueEmail` with a mock (`mockEnqueueEmail`). It is reset in `beforeEach` and resolves `undefined`, because the buyer mail chains `.catch` on the queue's promise.
- **`setupTestDb()`**: sets up the test database.
- **`beforeEach` / `afterEach`**: clear and re-subscribe a listener on `ORDER_PURCHASE_HOLD_PLACED` that collects facts into `placedFacts`. Afterwards they call `resetDomainEvents()` and `jest.restoreAllMocks()`.
- **Order helpers**:
  - `cancelOneAsBuyer`: cancels a pending order as the buyer.
  - `cancelOnePaidAsBuyer`: cancels a paid order as the buyer.
  - `withdrawOneUnpaid`: calls `orderService.withdrawById` on an unpaid order.
  - `letOneExpire`: calls `orderService.expireReservationById`.
- **Assertion helpers**:
  - `flaggedAt`: reads `purchaseHoldFlaggedAt` from the user.
  - `holdOf`: reads the stored purchase hold for a user.
  - `staffNotices` / `placedFacts`: the `order.purchase_hold_placed` facts emitted so far.
  - `buyerCanceled(orderId)`: builds the `{ refund: true, cause: 'customer' }` payload.
- **`describe('considerPurchaseHold')`** covers these cases:
  - No hold after 2 cancels; a hold with reason `repeated_cancellations` after the 3rd, announced once.
  - Redelivering the same cancel does not hold or announce twice.
  - Cancels with cause `operator`, or made by an admin on the buyer's behalf, are not counted.
  - A staff lift of the hold restarts the count.
  - The limit is configurable through the `NODE_PURCHASE_HOLD_CANCEL_COUNT` override.
  - The announced payload is `{ tenantId: DEPLOYMENT_TENANT_ID, userId, until }`.
  - `registerModules([ordersModule])` wires the handler to `order.canceled`.
  - A failure is logged as `purchase hold check failed` and the call still resolves.
  - A missing order is a no-op.
- **`describe('the pause counts what bots do')`** covers these cases:
  - The third unpaid order left to expire (`cause: 'reservation_expired'`, `refund: false`) triggers a hold.
  - The third unpaid withdrawal through returns (`cause: 'withdrawal'`) triggers a hold.
  - Cancels and withdrawals count together.

## Relationships
- **`orders/services`** (`orderService`): the unit under test (`considerPurchaseHold`, `cancelOnRequestById`, `withdrawById`, `expireReservationById`).
- **`orders/events`**: provides `ORDER_CANCELED` and `ORDER_PURCHASE_HOLD_PLACED`.
- **`orders/module`**: registered through `kernel/registry`'s `registerModules` to test event wiring.
- **`orders/repository`**: imported as `orderRepository` and used to simulate a failure in the error-handling case.
- **`kernel/events`**: `emitDomainEvent`, `onDomainEvent`, `resetDomainEvents` and the `DomainEventMap` type.
- **`kernel/outbox`**: `settleOutboxNudges` is awaited before emitting in the wiring test.
- **`kernel/access/tenant`**: `DEPLOYMENT_TENANT_ID` appears in the expected fact.
- **`users` module** (`@modules/users`, `users/repository`): used to read the stored hold, lift it, and read the review flag.
- **`orders/tests/factories`, `products/tests/factories`**: `createOrder`, `toOrderItem` and `createProduct` build fixtures.
- **`infrastructure/adapters/mailer`**: mocked.
- **`infrastructure/adapters/logger`**: spied on to check the logged failure.
- **`domain-primitives/time`**: `DAY_MS` is imported.

## Notes
- The `placedFacts` array is declared after `beforeEach` references it. This is fine because the hook runs only after module evaluation.
- The staff-notice assertions read the emitted `order.purchase_hold_placed` facts, not the mailer. The mailer mock exists so the "queue, not the copy" is what gets asserted.
- The paid-cancel helper `cancelOnePaidAsBuyer` is defined in the visible portion. Its use is not shown there.
