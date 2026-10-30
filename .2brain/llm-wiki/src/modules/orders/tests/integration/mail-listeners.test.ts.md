---
source: src/modules/orders/tests/integration/mail-listeners.test.ts
sha256: c22c219aae665d08430dc3c148c73e8f435b8ccdd70915077e36f5b248f3d995
generated_at: 2026-10-29T04:53:54.988175+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/mail-listeners.test.ts

## Purpose

Integration tests for the buyer-facing email listeners on the `order.created` and `order.cancelled` domain events. Verifies three contracts: the created event alone is sufficient to queue a confirmation mail; the `cause` on a cancel event selects (or suppresses) the appropriate template; and a mail failure never rejects the originating action.

## Key elements

- **`seedOrder(paymentMethod?)`** – Helper that creates a user, product, and a single-item order (defaulting to `card`), returning `{ user, order, orderId }` for assertions.
- **`templates()`** – Extracts the queued email template names (second arg of each `enqueueEmail` call) from the mock, in order.
- **`describe('order.created …')`** – Three cases: event fires the `orders.order-confirm` mail to the buyer; a missing order is a silent no-op; a queue throw is logged but does not reject.
- **`describe('order.cancelled …')`** – A parameterised matrix of `CancelCause` × `paymentMethod` → expected templates (e.g. `reservation_expired` + `card` → `orders.order-card-expired`; `reservation_expired` + `bank_transfer` → `[]`). Also covers mail-queue failure tolerance and that the cancel still succeeds when mail throws.
- **`describe('every cancel door …')`** – Iterates over all six cancel entry-points (`cancelOnRequestById` as customer/admin, `withdrawById`, `expireReservationById`, `cancelForErasureById`, `cancelForPaymentMismatchById`) and asserts the persisted outbox row's `payload.cause` matches the expected cause.
- **Mock setup** – `enqueueEmail` is fully mocked at module level; `logger.error` is spied per-test to capture failure logs without crashing.

## Relationships

| Neighbor | Interaction |
|---|---|
| `mailer.ts` | `enqueueEmail` is the sole I/O under test; mocked and asserted via call args. |
| `logger.ts` | `logger.error` spied to verify failure is logged, not thrown. |
| `kernel/events.ts` | `emitDomainEvent` drives listener execution; `resetDomainEvents` clears state in `afterEach`. |
| `kernel/outbox.ts` | `outboxEventModel` queried to verify persisted event payload; `settleOutboxNudges` flushes async writes before counting. |
| `kernel/registry.ts` | `registerModules([ordersModule])` wires listeners in `beforeEach`. |
| `orders/events.ts` | `ORDER_CREATED`, `ORDER_CANCELLED` are the event names emitted and matched. |
| `orders/module.ts` | `ordersModule` registered so its listeners subscribe during tests. |
| `orders/services/index.ts` | `orderService` provides `mailOrderPlaced`, `mailOrderCancelled`, `cancelOnRequestById`, `withdrawById`, `expireReservationById`, `cancelForPaymentMismatchById`. |
| `orders/services/cancel.ts` | `CancelCause` type shapes the matrix; `cancelForErasureById` is the erasure-door entry point. |
| `orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the fixture order. |
| `users/tests/factories.ts` | `createUser` supplies the buyer. |
| `products/tests/factories.ts` | `createProduct` supplies the item. |
| `tests/support/callers.ts` | `asAdmin`, `asCustomer`, `testCallerContext` build caller identities for the service calls. |
| `tests/support/ids.ts` | `MISSING_ID` used in the "order is gone" case. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory Mongo for real persistence. |

## Notes

- **Fire-and-forget mail contract:** every test that simulates a queue failure asserts the service call *resolves* (not rejects). The listener logs via `logger.error` and swallows the error—this is an intentional design guarantee, not an accident.
- **Cause → template mapping is not one-to-one.** `reservation_expired` on a `bank_transfer` order sends *no* mail (the `payments` module owns that communication). `withdrawal`, `erasure`, and `payment_mismatch` also send nothing.
- **`settleOutboxNudges()` is required** before asserting on `outboxEventModel.countDocuments` in the "act does not wait on mail" test; without it the async outbox write may not have landed.
- **`registerModules` in `beforeEach`** (not a one-time `beforeAll`) ensures each test gets a clean listener subscription; `resetDomainEvents` in `afterEach` prevents cross-test event bleed.
- The file docblock cross-references `docs/tools/outbox.md#customer-mail` as the canonical spec for the mail contract.
