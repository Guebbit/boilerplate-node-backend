---
source: src/modules/delivery/tests/integration/timeline.test.ts
sha256: a6295369ed89a764722f25c211b2ccbea221543d839c91d465d256a5ff096c3c
generated_at: 2026-10-14T15:39:00.128912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/timeline.test.ts

## Purpose
Integration tests that assert exactly which rows are written to an order's timeline (and with what `data`) when delivery services execute ship, deliver, fulfill, hold/release, and cancel acts. Runs against a real MongoDB instance via `setupTestDb`, exercising the services' public API rather than internal helpers. The central contract under test: the timeline records ids, codes, and reason codes — never free-text notes — and order-level status rows appear only when the last unit is affected.

## Key elements
- **`processingOrder()`** – Local factory: creates a user, a 10-unit-price product, a 2-unit `processing` order, and returns the order, product, and its first fulfillment order id.
- **`trail(orderId)`** – Reduces a timeline query to `[type, actor]` pairs for compact assertions.
- **`describe('shipping and delivering')`** – Four cases: one row per shipment + order-level `shipped` only on the last unit; tracking code / ids in `data`; refused acts write nothing; digital fulfilment emits `shipment_shipped → shipment_delivered → delivered` in one act.
- **`describe('holds')`** – Hold persists the `reason` code but **never** the free-text `note`; release writes a `fulfillment_released` row.
- **`describe('an order cancelled whole')`** – `cancelAllForOrder` adds **no** timeline rows (the order's own `cancelled` transition is the sole record).
- **`afterEach`** – Three cleanup steps: `jest.restoreAllMocks()`, `resetDomainEvents()`, `mockEnqueueEmail.mockClear()`.
- **Mailer mock** – `enqueueEmail` is jest-mocked at the module level to prevent real mail sends.

## Relationships
- **`src/modules/delivery/services/index.ts`** – All service functions (`shipFulfillmentOrder`, `deliverShipment`, `fulfillFulfillmentOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `cancelAllForOrder`) are imported from the barrel; this is the SUT's public door.
- **`src/modules/orders/tests/factories.ts`** – Provides `createOrder`, `seedDigitalOrder`, `toOrderItem`, and the critical `timelineOf` query helper.
- **`src/modules/delivery/tests/factories.ts`** – Provides `fulfillmentOrdersOf` and `shipmentsOf` for inspecting DB state.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`** – Seed upstream entities.
- **`src/infrastructure/adapters/mailer.ts`** – Mocked; verifies no real email is enqueued during delivery acts.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in teardown isolates event-emitter state between tests.
- **`tests/support/callers.ts`** – `asAdmin()` / `callerContextAs` build the actor context passed to every service call.
- **`tests/support/setup-test-db.ts`** – Boots and tears down the real Mongo instance the tests run against.
- **`src/types/index.ts`** – `OrderStatus.processing` used to set up initial order state.

## Notes
- The hold `note` field is explicitly asserted absent from the timeline via a `JSON.stringify` scan (`expect(JSON.stringify(rows)).not.toContain('caller sounded odd')`). This is a deliberate data-leakage guard, not just a shape check.
- Order-level rows (`shipped`, `delivered`) are **consequences** written only after the last unit in the fulfillment order is affected; per-unit rows are `shipment_*`. Mixing up the two levels is the most common misunderstanding this file protects against.
- `resetDomainEvents` is required because the delivery services emit kernel domain events as a side effect; without resetting, a leaked subscriber in one test can fire in the next.
- The "refused" test (shipping a held order) relies on the service returning `{ success: false }` **and** not writing any row — both are asserted.
