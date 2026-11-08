---
source: src/modules/orders/tests/integration/mail-listeners.test.ts
sha256: 6443d75c587a7acf49dd84f940acc436fa7f7e4b5a7520c8ab1cd69f4b24df1e
generated_at: 2026-11-08T07:05:44.999348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/mail-listeners.test.ts

## Purpose

Integration tests verifying that the orders module's event listeners send the correct buyer e-mail on `order.created` and `order.canceled`, that the cancel cause selects (or suppresses) the template, that a mail failure never rejects the underlying act, and that every cancel door records its cause on the outbox row.

## Key elements

- **`seedOrder(paymentMethod?)`** – creates a user, a product, and a single-item order via factories; returns `{ user, order, orderId }`.
- **`templates()`** – reads `mockEnqueueEmail.mock.calls` and maps each call to its template string.
- **`describe("order.created sends the placed-order mail")`** – asserts the `orders.order-confirm` template is queued, that a missing order is a silent no-op, and that a queue throw is caught and logged without rejecting.
- **`describe("order.canceled sends the mail its cause picks")`** – `it.each` matrix over `(cause, paymentMethod) → expected templates`; confirms `customer`/`operator` → `order-canceled`, `reservation_expired` + card → `order-card-expired`, and `reservation_expired` + bank_transfer / `withdrawal` / `erasure` / `payment_mismatch` → no mail. Also verifies mail failure is non-fatal and that the cancel act still writes the outbox event.
- **`describe("every cancel door names its cause on the row it writes")`** – `it.each` over all six `CancelCause` values; invokes each service method and asserts the outbox row payload contains the correct `cause`.

## Relationships

- **`@infrastructure/adapters/mailer`** – `enqueueEmail` is mocked; the test inspects its calls to assert template and recipient.
- **`@infrastructure/adapters/logger`** – `logger.error` is spied on to confirm the "mail failed" path logs.
- **`@kernel/events`** – `emitDomainEvent` fires `ORDER_CREATED` / `ORDER_CANCELED`; `resetDomainEvents` cleans up in `afterEach`.
- **`@kernel/outbox`** – `outboxEventModel` reads the persisted event row to assert cause; `settleOutboxNudges` flushes pending outbox writes before assertions.
- **`@kernel/registry`** – `registerModules([ordersModule])` in `beforeEach` wires the listeners under test.
- **`src/modules/orders/events.ts`** – imports the `ORDER_CREATED` and `ORDER_CANCELED` symbol constants.
- **`src/modules/orders/module.ts`** – the module whose listeners this file exercises.
- **`src/modules/orders/services/index.ts`** – `orderService` provides `mailOrderPlaced`, `mailOrderCanceled`, `cancelOnRequestById`, `withdrawById`, `expireReservationById`, `cancelForPaymentMismatchById`.
- **`src/modules/orders/services/cancel.ts`** – `CancelCause` union type and `cancelForErasureById` entry point.
- **Factories (`@modules/orders/tests/factories`, `@modules/products/tests/factories`, `@modules/users/tests/factories`)** – build the domain objects seeded per test.
- **`@tests/callers`** – `asAdmin`, `asCustomer`, `testCallerContext` supply auth context to service calls.
- **`@tests/ids`** – `MISSING_ID` for the "order is gone" negative case.
- **`@tests/setup-test-db`** – `setupTestDb()` initialises the in-memory Mongo before the suite.

## Notes

- The mock comment "The queue, not the copy" signals intent: tests assert at the enqueue boundary, not at actual SMTP delivery.
- `reservation_expired` on a `bank_transfer` order intentionally produces **no** mail — that scenario is the `payments` module's responsibility.
- The "act does not wait on mail" test calls `settleOutboxNudges()` after the service call; without it the outbox row may not yet be visible.
- `it.each` with a tuple array is the project convention for cause/payment-method matrices; keep new cases as additional tuples rather than separate `it` blocks.
