---
source: src/modules/delivery/tests/integration/timeline.test.ts
sha256: 0f32417f461183dd70b755b34d4f6aae02a8b20fe375dc1959557e28923b9128
generated_at: 2026-10-29T03:48:43.168479+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/timeline.test.ts

## Purpose

Integration test that verifies what timeline (audit-log) rows each delivery action writes onto an order. It exercises `deliveryService` through its public API against real MongoDB and asserts row types, actor attribution, data payloads (ids, tracking codes, reason codes), and—critically—that a hold's free-text note is never persisted.

## Key elements

- **`processingOrder()`** – Fixture helper: creates a user, a product (price 10), a `processing` order with 2 units, and returns `{ order, product, fulfillmentOrderId }`.
- **`trail(orderId)`** – Reads the order's timeline and projects it to `[type, actor]` pairs for compact assertions.
- **`admin`** – The caller context (`callerContextAs('admin','admin-1')`) used as the actor for every service call.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a `jest.fn()` so no mail is dispatched during tests.
- **`describe` blocks** – Group tests by delivery concern: *shipping and delivering*, *starting fulfilment*, *holds*, *order cancelled whole*.
- **`afterEach`** – Restores all mocks, calls `resetDomainEvents()`, and clears the mailer mock to prevent cross-test leakage.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/delivery/services/index.ts` | System under test; all service calls go through `deliveryService`. |
| `src/modules/orders/tests/factories.ts` | Provides `createOrder`, `seedDigitalOrder`, `toOrderItem`, and the `timelineOf` reader. |
| `src/modules/users/tests/factories.ts` | `createUser` for order ownership. |
| `src/modules/products/tests/factories.ts` | `createProduct` for order line items. |
| `src/modules/delivery/tests/factories.ts` | `fulfillmentOrdersOf`, `shipmentsOf` to query delivery domain rows. |
| `src/infrastructure/adapters/mailer.ts` | Mocked; `enqueueEmail` is spied on to keep tests side-effect-free. |
| `src/kernel/events.ts` | `resetDomainEvents()` clears the in-memory event bus between tests. |
| `src/types/index.ts` | `OrderStatus` enum used in fixtures and assertions. |
| `tests/support/callers.ts` | `asAdmin`, `callerContextAs` build the caller/actor context passed to services. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions the real Mongo instance for the suite. |

## Notes

- **Only the mailer is mocked.** Every database read/write hits a real Mongo instance, making these true integration tests.
- **Note-secrecy assertion.** The *holds* test explicitly asserts `JSON.stringify(rows)` does not contain the hold note text—this is a security invariant, not just a data-shape check.
- **Digital fulfilment is a single act** that writes three rows (`shipment_shipped` → `shipment_delivered` → `delivered`) atomically; there is no separate ship-then-deliver step.
- **`cancelAllForOrder` writes no timeline rows of its own**; the test asserts the timeline is empty because the order-level `cancelled` event is considered sufficient.
- **`resetDomainEvents()`** in `afterEach` prevents accumulated in-memory domain events from affecting subsequent tests (e.g., side effects from event handlers).
