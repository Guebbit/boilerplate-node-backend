---
source: src/modules/orders/tests/integration/service-override.test.ts
sha256: c9e42d8377061057418eabac1a973d4a1934c04a3c7e5ec22bf3d25975cb805d
generated_at: 2026-10-29T04:56:55.830038+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-override.test.ts

## Purpose

Integration tests for the `overrideStatus` admin action. Runs against a real MongoDB instance (via `setupTestDb`) rather than mocks, because the critical guarantee under test is a conditional write that cannot be validated when the store is simulated — a mock cannot race against itself. Covers status-transition rules, event emission, timeline entries, and edge cases for digital-only orders.

## Key elements

- **`describe('overrideStatus on a digital-only order')`** — Verifies that shipping a digital-only order is refused (409), and that the withdrawal deadline is counted from the payment date when landing on `delivered`.
- **`describe('overrideStatus')`** — Core transition tests: forward move succeeds and writes a `status_overridden` timeline entry; moves into `paid`, out of `pending`, and backward moves are all refused; a concurrent write between read and write yields 409 with no timeline entry; no parcel/shipment record is created (status-only door).
- **`describe('the override event')`** — Asserts `ORDER_STATUS_OVERRIDDEN` fires alongside `ORDER_STATUS_CHANGED`; confirms awaiting-stock guard blocks moves to `shipped`/`delivered` but allows `processing`; verifies `withActions` omits `shipped`/`delivered` from the override menu when units await stock.
- **`beforeEach` / `afterEach`** — Calls `markDomainEventsWired()` / `resetDomainEvents()` to manage the kernel event subscription lifecycle.
- **`settleOutboxNudges()`** — Flushes the outbox relay before asserting on delivered events.

## Relationships

| Neighbor | Interaction |
|---|---|
| `services/override.ts` | SUT — imports and calls `overrideStatus`. |
| `services/actions.ts` | Imports `withActions` to assert the override menu (available status targets). |
| `model.ts` | `orderModel` used directly in the race-condition test (spies on `findByIdScoped`) and in stock-guard setup queries. |
| `repository.ts` | `orderRepository.findByIdScoped` is spied on to simulate a concurrent write between the read and the conditional write. |
| `events.ts` (orders) | Imports `ORDER_STATUS_CHANGED` and `ORDER_STATUS_OVERRIDDEN` event names for subscription and payload assertions. |
| `kernel/events.ts` | Imports `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` for the event bus lifecycle. |
| `kernel/outbox.ts` | Imports `settleOutboxNudges` to drain async outbox deliveries before asserting. |
| `types/index.ts` | Imports `OrderStatus` enum for all status literals. |
| `tests/factories.ts` | Imports `seedOrder`, `seedDigitalOrder`, `readOrder`, `timelineOf` for setup and assertions. |
| `tests/support/callers.ts` | Imports `asAdmin`, `callerContextAs` to build admin caller contexts. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` once at module load to provision a real Mongo test database. |

## Notes

- **No DB mocks by design.** The module doc states the rationale explicitly: the conditional-write guarantee requires a real store. The only spy in the file is on `orderRepository.findByIdScoped` to *inject* a race, not to mock reads.
- **Outbox delivery is async.** Assertions on event payloads must follow `await settleOutboxNudges()`; forgetting it makes events appear empty.
- **Two distinct events fire on override.** `ORDER_STATUS_CHANGED` is the universal status-change channel (webhooks filter on `to`); `ORDER_STATUS_OVERRIDDEN` is an additional announcement carrying the `at` timestamp and `mode: 'status'`. They are not interchangeable.
- **`markDomainEventsWired()` is required** in `beforeEach` because the outbox relay only delivers in a process whose modules are subscribed — without it, `onDomainEvent` callbacks never fire.
- **Awaiting-stock guard is asymmetric.** Moves to `processing` are allowed even when units await stock (processing ships nothing); moves to `shipped`/`delivered` are blocked with error code `ORDER_OVERRIDE_AWAITING_STOCK`.
