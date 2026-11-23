---
source: src/modules/orders/tests/integration/mail-listeners.test.ts
source_sha256: 15a76acc5b5032db1e285e7fc26f38526058cb95ea586ae9beb69449f1b851a5
context_sha256: bd78d3e4de4a737c528f442005b71277feb1d3badd80ca99d22072c1325c9e00
generated_at: 2026-11-22T06:29:17.298603+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/mail-listeners.test.ts

## Purpose
Integration tests for the orders module's buyer-mail listeners on `order.created` and `order.canceled`. They check that the event alone is enough to send the mail, that the cancel cause picks which mail goes out, that a failing mail never fails the act, and that every cancel entry point records its cause on the outbox row it writes.

## Key elements
- `mockEnqueueEmail`: a mocked `enqueueEmail`. `@infrastructure/adapters/mailer` is replaced via `jest.mock`, so the tests assert the queued template rather than the mail copy.
- `seedOrder(paymentMethod)`: creates a user, a product and an order with one item. The method is `'card'`, `'bank_transfer'` or `'unset'`. `'unset'` writes no method, like a staff-created order. It returns `{ user, order, orderId }`.
- `templates()`: the template names queued so far, in order.
- `describe('order.created ...')`:
  - `ORDER_CREATED` emitted with only `{ orderId }` enqueues `orders.order-confirm`, addressed to `order.email`.
  - `orderService.mailOrderPlaced` resolves without sending for a missing order (`MISSING_ID`).
  - `mailOrderPlaced` resolves when the queue throws, and the logger's `error` is called with `'mailBuyer: sending the buyer mail failed.'`.
- `describe('order.canceled ...')`:
  - A table-driven `it.each` over cause and payment method gives these results:

    | Cause | Payment method | Template queued |
    |---|---|---|
    | `customer` | card | `orders.order-canceled` |
    | `operator` | bank_transfer | `orders.order-canceled` |
    | `reservation_expired` | card or unset | `orders.order-hold-expired` |
    | `reservation_expired` | bank_transfer | none (a transfer nobody sent is answered by `payments`) |
    | `withdrawal`, `erasure`, `payment_mismatch` | card | none |

  - `mailOrderCanceled` resolves when the queue throws.
  - `cancelOnRequestById` still succeeds when the mailer throws. After `settleOutboxNudges()`, exactly one `ORDER_CANCELED` outbox row exists.
- `describe('every cancel door ...')`: runs each cancel path and checks the stored `ORDER_CANCELED` outbox payload contains `{ orderId, cause }`. The paths are:
  - `cancelOnRequestById` as a customer (cause `customer`) and as an admin (cause `operator`).
  - `withdrawById`.
  - `expireReservationById`.
  - `cancelForErasureById`.
  - `cancelForPaymentMismatchById`.

## Relationships
- `src/kernel/events.ts`: `emitDomainEvent` fires the events, and `resetDomainEvents` runs in `afterEach`.
- `src/kernel/registry.ts`: `registerModules([ordersModule])` in `beforeEach` wires up `src/modules/orders/module.ts` so its listeners are live.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried for the persisted cancel rows, and `settleOutboxNudges` waits for the outbox to settle.
- `src/modules/orders/services/index.ts` (`orderService`) and `src/modules/orders/services/cancel.ts`: the code under test. These are the mail handlers, the cancel entry points, `cancelForErasureById` and the `CancelCause` type.
- `src/modules/orders/events.ts`: provides the `ORDER_CREATED` and `ORDER_CANCELED` constants.
- `src/infrastructure/adapters/mailer.ts`: mocked.
- `src/infrastructure/adapters/logger.ts`: its `logger` is spied on, to silence output and to assert the failure log.
- Test support: `tests/support/setup-test-db.ts` (`setupTestDb`), the user, product and order factories (`createUser`, `createProduct`, `createOrder`/`toOrderItem`), `tests/support/callers.ts` (`asAdmin`/`asCustomer`/`testCallerContext`), and `tests/support/ids.ts` (`MISSING_ID`).

## Notes
- `jest.restoreAllMocks()` runs in `afterEach` and `mockClear()` runs in `beforeEach`. Tests that call `mockImplementation` (not `Once`) on the mailer therefore depend on that reset.
- Mail suppression for `reservation_expired` depends on the payment method. Bank-transfer orders get no hold-expired mail here, and a missing method counts as notifiable.
- Only `customer` and `operator` causes send the canceled mail, and only for non-`reservation_expired` causes listed in the table. The other causes send nothing from this listener.
