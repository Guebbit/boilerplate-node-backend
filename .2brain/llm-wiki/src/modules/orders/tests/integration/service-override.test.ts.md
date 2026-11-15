---
source: src/modules/orders/tests/integration/service-override.test.ts
sha256: be3c095f63482fdbfb4550a5b920a2fb084f87daae0e367d123494927603877e
generated_at: 2026-11-14T20:55:16.644791+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-override.test.ts

## Purpose

Integration tests for `overrideStatus`, the admin "status-only" door that manually moves an order between statuses. Runs against real Mongo so that the conditional-write guarantee (a 409 if another writer lands between read and write) and the outbox-delivery path are exercised for real — behaviors a mock cannot reproduce by racing against itself.

## Key elements

- **`overrideStatus`** (imported from `src/modules/orders/services/override.ts`) — the function under test; accepts order ID, target status, reason, and caller context.
- **`withActions`** (imported from `src/modules/orders/services/actions.ts`) — used in the final test to assert that the override *menu* excludes `shipped`/`delivered` when units are still awaiting stock.
- **Three `describe` blocks:**
  - *digital-only order* — refuses `shipped` (no parcel), computes `withdrawUntil` from payment date when landing on `delivered`.
  - *overrideStatus* — forward moves, timeline entry shape, `paid` is system-only, `pending` is exit-guarded, backward moves refused, race → 409 with no history written, pre-state recorded as `from`, no parcel side-effect.
  - *the override event* — `ORDER_STATUS_OVERRIDDEN` payload shape and `at` alignment with timeline row; refused with 409 + `ORDER_OVERRIDE_AWAITING_STOCK` when stock is pending; `processing` still allowed while awaiting stock; menu omits `shipped`/`delivered` in that state.
- **Test helpers** — `seedOrder`, `seedDigitalOrder`, `readOrder`, `timelineOf` (factories); `asAdmin`, `callerContextAs` (callers); `setupTestDb` (real Mongo); `markDomainEventsWired` / `resetDomainEvents` / `onDomainEvent` (kernel events); `settleOutboxNudges` (kernel outbox).

## Relationships

- **`src/modules/orders/services/override.ts`** — SUT; every assertion targets its return shape and side effects.
- **`src/modules/orders/services/actions.ts`** — `withActions` is called to verify the UI-facing menu defers to the same stock guard the service enforces.
- **`src/modules/orders/repository.ts`** — `orderRepository.findByIdScoped` is spied on (single test) to inject a concurrent `$set` between the service's read and conditional write, simulating a second process.
- **`src/modules/orders/model.ts`** — `orderModel.updateOne` / `findByIdAndUpdate` used directly to set `fulfillment` fields (awaiting-stock fixtures) and to write the concurrent status in the race test.
- **`src/modules/orders/events.ts`** — `ORDER_STATUS_CHANGED` and `ORDER_STATUS_OVERRIDDEN` are the two event constants subscribed and asserted on.
- **`src/kernel/events.ts`** — `markDomainEventsWired` in `beforeEach` subscribes the process so the outbox relay can deliver; `resetDomainEvents` in `afterEach` prevents cross-test leakage.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` is awaited before asserting on delivered event payloads.
- **`src/modules/orders/tests/factories.ts`** — provides seeded orders and a `timelineOf` reader for history assertions.
- **`tests/support/callers.ts`** — `asAdmin()` and `callerContextAs('admin', 'admin-1')` supply the admin auth context every call requires.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real Mongo connection for the suite.
- **`src/types/index.ts`** — `OrderStatus` enum values used throughout.

## Notes

- Real Mongo is required: the 409 race test relies on a *second* Mongo write landing between the service's read and its conditional `updateOne` — impossible to simulate with in-process mocks.
- The single `jest.spyOn` (on `orderRepository.findByIdScoped`) is the only mocking in the file and is scoped to one test; it is restored immediately after the assertion.
- `settleOutboxNudges()` must appear before any `expect` on outbox-delivered events; without it the event may still be in the outbox queue.
- The override is explicitly *status-only*: no shipment record is created. The test asserts this by confirming no parcel-side field changes.
- `paid` is a system-only destination (set by the payment webhook); `pending` is exit-guarded to the offline-payment door only. Both are hard-refused by `overrideStatus` regardless of the target's forward/backward position.
