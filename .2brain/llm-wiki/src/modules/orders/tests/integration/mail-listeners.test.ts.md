---
source: src/modules/orders/tests/integration/mail-listeners.test.ts
sha256: a9695f413a4b5e6f55365d28f9812763c0d932bc3fee882262034bd5a366daa2
generated_at: 2026-11-14T20:52:12.612044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/mail-listeners.test.ts

## Purpose

Integration tests for the buyer-mail listeners on `ORDER_CREATED` and `ORDER_CANCELED`. Verifies three invariants: the correct template is queued for each (cause × payment-method) combination, a mail failure never rejects the calling act, and every cancel path writes its `CancelCause` into the outbox event row.

## Key elements

- **`seedOrder(paymentMethod?)`** — creates a user, a product, and a one-item order; returns `{ user, order, orderId }`. Payment method is `'card'`, `'bank_transfer'`, or `'unset'` (no method field, as in staff-created orders).
- **`templates()`** — reads the queued template names from the mocked `enqueueEmail` call arguments.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a `jest.fn()` so the test asserts *what was queued*, not what was sent.
- **`describe('order.created …')`** — three cases: happy-path template, missing-order no-op, and queue-down logs an error but resolves.
- **`describe('order.canceled …')`** — `it.each` table of 8 (cause, paymentMethod) → expected template(s) pairs; plus queue-down and "act completes despite mail failure" cases.
- **`describe('every cancel door names its cause …')`** — `it.each` over all six cancel service methods, asserting the persisted outbox row's `payload.cause` matches the expected `CancelCause`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/logger.ts` | Imported as `logger`; the test spies on its `error` method to suppress and assert failure-path logging. |
| `src/infrastructure/adapters/mailer.ts` | Mocked — `enqueueEmail` is replaced by a `jest.fn()`; the test asserts which templates were queued. |
| `src/kernel/events.ts` | `emitDomainEvent` fires `ORDER_CREATED` / `ORDER_CANCELED`; `resetDomainEvents` called in `afterEach`. |
| `src/kernel/outbox.ts` | `outboxEventModel` reads persisted event rows; `settleOutboxNudges` flushes pending writes before assertions. |
| `src/kernel/registry.ts` | `registerModules([ordersModule])` wires listeners before each test. |
| `src/modules/orders/events.ts` | `ORDER_CREATED`, `ORDER_CANCELED` event-name constants. |
| `src/modules/orders/module.ts` | `ordersModule` passed to `registerModules`. |
| `src/modules/orders/services/index.ts` | Provides `orderService`, whose methods (`cancelOnRequestById`, `withdrawById`, `expireReservationById`, `cancelForPaymentMismatchById`, `mailOrderPlaced`, `mailOrderCanceled`) are exercised by the tests. |
| `src/modules/orders/services/cancel.ts` | `CancelCause` type import; `cancelForErasureById` called directly in the cause-naming table. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the order fixture. |
| `src/modules/products/tests/factories.ts` | `createProduct()` seeds the line-item product. |
| `src/modules/users/tests/factories.ts` | `createUser()` seeds the buyer. |
| `tests/support/callers.ts` | `asAdmin`, `asCustomer`, `testCallerContext` supply caller identity for cancel calls. |
| `tests/support/ids.ts` | `MISSING_ID` used to exercise the not-found path. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions the in-memory DB before all tests. |

## Notes

- The `it.each` table encodes the full business matrix. Notable "no-mail" rows: `reservation_expired` + `bank_transfer` (handled by the `payments` module), and all of `withdrawal`, `erasure`, `payment_mismatch`.
- Mail is fire-and-forget: tests assert the service call **resolves** even when `enqueueEmail` throws, and that a subsequent outbox row is still written.
- `settleOutboxNudges()` is required after cancel calls before asserting on `outboxEventModel` — the outbox write is async/nudged, not synchronous.
- The mock targets `enqueueEmail` (the queue adapter), not the mail-rendering layer, per the "The queue, not the copy" comment.
