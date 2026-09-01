# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration test suite for the delivery module. It exercises the four public service functions (`priceShipping`/`findShippingMethod`, `shipOrder`, `runCourierAdvance`, `getForOrder`) against a real Mongo instance, and verifies the event-driven subscription that automatically creates a shipment when an order's status is moved to `shipped`. The mailer is mocked; everything else is live.

## Key elements

- **`shippedOrderFor`** — shared fixture helper: creates a user, a 10-unit product, a single-item order, and force-updates the order to `shipped`.
- **`rates` block** — unit-level checks on `priceShipping` and `findShippingMethod` from the delivery domain: threshold behavior, no-threshold methods, free pickup, unknown-id → `undefined`.
- **`shipOrder` block** — asserts one parcel + one tracking email per order (idempotent on repeated calls); verifies tracking code format and email template/recipient.
- **`runCourierAdvance` block** — confirms a courier tick transitions both the order and the shipment to `delivered`, and that a second tick is a no-op (returns 0).
- **`getForOrder` block** — access-control checks: owner gets 200, stranger gets 404, owner with an unshipped order also gets 404 (parcel absence).
- **`shipment rides the status change` block** — full event-subscription test: registers all five modules, drives `orderService.update` to set status `shipped`, and asserts the shipment record appears without any explicit `shipOrder` call.
- **`mockEnqueueEmail`** — `jest.mock` of `enqueueEmail` from the mailer adapter; the only external I/O stub in the file.
- **`asReject`** — tiny type-assertion helper casting an `unknown` result to `ResponseReject` for readable status checks.

## Relationships

- **`src/modules/delivery/service.ts`** — primary subject under test (`shipOrder`, `runCourierAdvance`, `getForOrder`).
- **`src/modules/delivery/domain/index.ts`** — imports `findShippingMethod`, `priceShipping`, `SHIPPING_METHODS` for the rates tests.
- **`src/modules/delivery/repository.ts`** — `shipmentRepository` used to assert persisted parcel state.
- **`src/modules/delivery/module.ts`** — registered in the event-subscription suite so the `shipped` listener is wired.
- **`src/modules/orders/index.ts`** — imports `orderService`, `orderRepository` to drive status changes and fetch orders.
- **`src/modules/orders/module.ts`**, **`src/modules/inventory/module.ts`** — co-registered alongside delivery in the event suite.
- **`src/modules/orders/tests/fixtures.ts`** — provides `createOrder`, `toOrderItem` used by every test that needs an order.
- **`src/kernel/registry.ts`** — `registerModules` wires the module graph for the event test.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` to isolate event state.
- **`src/infrastructure/adapters/mailer.ts`** — fully mocked; the test asserts `enqueueEmail` call count, args, and template.
- **`src/infrastructure/http/response.ts`** — imports the `ResponseReject` type for status-code assertions.

## Notes

- **Real database, not in-memory.** `setupTestDb()` at module top opens a real Mongo connection; there is no `mongodb-memory-server` wrapper.
- **Event test registers *all* modules** (products, users, inventory, orders, delivery) — not just delivery — because the orders service internally depends on inventory and products.
- **The event test sets the order to `processing` first** before updating to `shipped`, because the domain enforces a `processing → shipped` transition. The comment makes explicit this is about the status write, not the payment flow.
- **Mailer mock is module-level** (`jest.mock` hoisted), so it applies to every `describe` block, not just the email-related ones.
- **`asReject` exists because** the service returns a discriminated union; the helper avoids repeating `as ResponseReject` inline.
