# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration test suite for the delivery service's public API (`shipOrder`, `runCourierAdvance`, `getForOrder`) and its domain pricing rules. It pins the free-shipping threshold behavior, parcel idempotency, the courier tick's order-then-parcel sequencing, read-side authorization, and the event-driven subscription that auto-creates a parcel when an order reaches `shipped`.

## Key elements

- **`rates` suite** — unit-level checks against `findShippingMethod`, `priceShipping`, and `SHIPPING_METHODS` (threshold-free rule, no-threshold methods, pickup-as-free-but-present, unknown-id → `undefined`).
- **`shipOrder` suite** — verifies a single parcel is created with a deterministic tracking code (`TRK-<last 8 chars of order id>`), exactly one `enqueueEmail` call with template `delivery.shipment-shipped`, and full idempotency under repeated invocation.
- **`runCourierAdvance` suite** — asserts the courier tick delivers all in-transit parcels (order status updates before parcel status), and that a second tick is a no-op.
- **`getForOrder` suite** — confirms the owner sees the shipment, a stranger gets `404`, and an unshipped order is also absent (not an error distinct from "not found").
- **`shipment rides the status change` suite** — registers all modules, sets an order to `processing`, then calls `orderService.update(…, { status: 'shipped' })` and asserts a parcel appears with no explicit delivery call. Uses `registerModules` / `resetDomainEvents` to wire and tear down the event bus.
- **`shippedOrderFor`** — helper that creates a user, product, order, and force-transitions the order to `shipped` via `orderRepository.updateStatusIfIn`.
- **`asReject`** — thin cast to `ResponseReject` so assertions can read `.status` on a failed result.

## Relationships

- **`src/modules/delivery/service.ts`** — the system under test; all three service functions are exercised directly.
- **`src/modules/delivery/domain/index.ts` / `rates.ts`** — pricing rules and `SHIPPING_METHODS` constant are asserted against.
- **`src/modules/delivery/repository.ts`** — `shipmentRepository` is queried to verify persisted parcels.
- **`src/modules/delivery/module.ts`** — registered in the event-subscription test so the `OrderStatusChanged` handler is active.
- **`src/modules/orders/service.ts` / `repository.ts`** — used to create orders, drive status transitions, and read back order state after courier advance.
- **`src/modules/orders/tests/factory.ts`** — `createOrder`, `toOrderItem` build fixture data.
- **`src/modules/inventory/module.ts`** — registered alongside other modules so the full event pipeline resolves (inventory participates in order lifecycle events).
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is jest-mocked; the test asserts call count, recipient, template, and payload.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type is used to type-cast failed `getForOrder` results for `.status` assertions.
- **`src/kernel/events.ts`** — `resetDomainEvents` tears down the event bus between subscription tests.
- **`src/kernel/registry.ts`** — `registerModules` wires module event handlers for the subscription test.

## Notes

- Uses **real Mongo** (`setupTestDb`); only the mailer is mocked. This matches the project's convention of integration tests hitting the database.
- The tracking code is deterministic: `TRK-` + last 8 hex chars of the order `_id`, uppercased. Tests assert this exact format.
- The event-subscription suite is the only block that calls `registerModules`; all other suites rely on direct service calls and don't need the event bus wired.
- `shippedOrderFor` bypasses the normal `pending → processing → shipped` flow by writing `shipped` directly via the repository — the test explicitly notes "how it reached the queue is not what this test is about."
- The `ResponseReject` cast (`asReject`) exists because the service returns a discriminated union (`ResponseOk | ResponseReject`); the test needs the `.status` field that only the reject variant carries.
