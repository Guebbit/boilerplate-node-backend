---
source: src/modules/returns/tests/integration/close-by-hand.test.ts
source_sha256: 5c3f15d90ed8198328597fcd7588db776421a075e663a99e31d90bbfe9d4a608
context_sha256: 24ea7176299d480ee17ba1d0ff8a36cfb498d560efb41889c2b0f18fe73685d2
generated_at: 2026-11-22T07:33:57.485606+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/close-by-hand.test.ts

## Purpose
Integration tests for `returnService.closeReturnByHand`, the manual way out for a `received` return whose refund was canceled or paid outside the app. The tests pin down that closing moves no money or stock, announces no `return.closed` event (whose mail says the money went back), and keeps the operator's note only in the audit row.

## Key elements
- `setupTestDb()` and `registerCheckoutModules([paymentsModule, returnsModule])` (in `beforeEach`) set up the database and the modules under test.
- `audited` / `registerAuditSink`: collects `AuditEntry` rows written during each test.
- `afterEach`: calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- `paidInCash()`: fixture helper. It creates a user, a Shirt (30.00) and a Mug (10.00), then an order of 2 shirts and 1 mug. It reserves stock, records a CASH offline payment as admin, and returns `{ user, shirt, mug, orderId }`. It uses a counter to give each customer a distinct email.
- `paymentOf(orderId)`: reads the order's payment as admin.
- `receivedWithCanceledRefund()`: carries the order to `delivered`, creates a `withdrawal` return, and receives it as warehouse. It then cancels the pending refund via `paymentService.cancelRefund` with the note "paid back in cash already", and returns `{ ...fixture, returnId }`.
- Test cases:
  - A successful close:
    - the status becomes `closed` and `closedAt` is set;
    - exactly one `admin.return.closed` audit entry is written, with `targetType: 'return'` and metadata `{ orderId, note }`;
    - one `return_closed` timeline row is written, and it must not contain the note text;
    - no `RETURN_CLOSED` outbox event exists after `settleOutboxNudges()`.
  - The note is optional. When it is omitted, the audit metadata has no `note` key. `actions.close` is `true` on a received return and `false` after closing.
  - A second close returns 409 `RETURN_NOT_CLOSABLE`, writes no further audit entries, and leaves a single timeline row.
  - A `requested` return is refused with `RETURN_NOT_CLOSABLE`, because it is declined rather than closed.
  - A canceled return is refused with `RETURN_NOT_CLOSABLE`.
  - A nonexistent return id returns 404.

## Relationships
- `returns/services` (`returnService`: `createReturn`, `receiveReturn`, `getReturn`, `cancelReturn`, `closeReturnByHand`) is the unit under test.
- `returns/events` supplies `RETURN_CLOSED`, which is checked against the outbox model from `@kernel/outbox` (`outboxEventModel`, `settleOutboxNudges`).
- `returns/module` and `payments/module` are registered for each test. `payments/services` (`paymentService`: `recordOfflinePayment`, `getForOrder`, `cancelRefund`) builds the cash payment and the canceled refund.
- `inventory` (`inventoryService`) is used by the `paidInCash()` fixture to hold the units for the order.
- `kernel/events` provides `resetDomainEvents` for cleanup.
- `infrastructure/observability/audit` provides `registerAuditSink` and `AuditEntry` for capturing audit rows.
- The `users`, `products`, `orders` and `delivery` test factories supply the fixtures. `timelineOf` and `createOrder` come from the orders factories, and `carryOrderTo` comes from the delivery factories.
- Shared `@tests/*` helpers provide the DB setup, the module registration, the callers and `asReject`.

## Notes
- Tests that check audit rows reset `audited = []` after setup, so only entries from the close call itself are asserted.
- The timeline assertion checks that the serialized row does not contain `cash`, so the note stays out of the order timeline.
- Only a `received` return can be closed by hand. `requested` and `canceled` returns are refused, and a second close is refused.
