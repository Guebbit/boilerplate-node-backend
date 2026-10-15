---
source: src/modules/orders/tests/integration/service-override.test.ts
sha256: bce466bdf933cc79151b3f87ebaf12a743a665b856e356a8fda8454c7a059137
generated_at: 2026-10-15T11:17:43.632685+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-override.test.ts

## Purpose

Integration tests for the admin order-status override (`overrideStatus`) and forced-fulfilment recording (`recordForcedFulfilment`). Runs against a real MongoDB instance so that the conditional-write guarantee and the read-then-write race window are exercised for real — the file header notes that a mock "cannot race against itself."

## Key elements

- **`describe('overrideStatus on a digital-only order')`** — Guards specific to digital orders: refuses `shipped` (no parcel), and computes `withdrawUntil` from the payment date when landing on `delivered`.
- **`describe('overrideStatus')`** — Core business rules: forward-only moves, `paid` is a system-only destination, `pending` can only be left via the offline-payment door, backward moves are refused, race-condition 409 (simulated with `jest.spyOn` on `orderRepository.findByIdScoped`), history timeline entry shape, and absence of parcel side-effects.
- **`describe('the override event')`** — Verifies the `ORDER_STATUS_OVERRIDDEN` event payload (includes `at`, `mode`), the awaiting-stock guard that blocks `shipped`/`delivered` (409 + `ORDER_OVERRIDE_AWAITING_STOCK` code), and that `withActions` filters the override menu accordingly.
- **`describe('recordForcedFulfilment')`** — Confirms a history row is written with the post-act status (test body truncated in source).
- **Lifecycle hooks** — `setupTestDb()` at module top; `markDomainEventsWired()` in `beforeEach`; `resetDomainEvents()` in `afterEach`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `services/override.ts` | SUT — `overrideStatus` is the function under test. |
| `services/fulfillment.ts` | SUT — `recordForcedFulfilment` is tested in the last describe block. |
| `services/scope.ts` | `withActions` is called to assert the override menu excludes invalid targets while stock is pending. |
| `model.ts` | `orderModel.updateOne` / `findByIdAndUpdate` used directly to seed `fulfillment` sub-docs and to simulate a concurrent writer in the race test. |
| `repository.ts` | `orderRepository.findByIdScoped` is spied on to inject a competing status change between the override's read and write. |
| `events.ts` (orders) | `ORDER_STATUS_CHANGED` and `ORDER_STATUS_OVERRIDDEN` constants are passed to `onDomainEvent` to capture emitted payloads. |
| `kernel/events.ts` | `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` manage the in-process event bus lifecycle. |
| `kernel/outbox.ts` | `settleOutboxNudges` flushes outbox-delivered events so assertions can run after emission. |
| `infrastructure/runtime/database.ts` | `withTransaction` imported (used in the `recordForcedFulfilment` test). |
| `tests/factories.ts` | `seedOrder`, `seedDigitalOrder`, `readOrder`, `timelineOf` provide seed and assertion helpers. |
| `tests/support/callers.ts` | `asAdmin`, `callerContextAs` build the admin caller context passed to every service call. |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises and tears down the real Mongo instance. |
| `types/index.ts` | `OrderStatus` enum values used throughout assertions and calls. |

## Notes

- **Real Mongo, not mocks.** The entire file deliberately avoids mocking the database or repository for the happy path. The only mock is a targeted `jest.spyOn` in the race-condition test, which simulates a concurrent writer landing between the override's read and its conditional write.
- **Event delivery is two-step.** Events are emitted via the kernel event bus but delivered through the outbox; assertions on event payloads must be preceded by `await settleOutboxNudges()`. Forgetting this step yields empty event arrays.
- **`markDomainEventsWired` is required per-test.** The outbox relay only delivers in a process whose modules are subscribed; without the `beforeEach` call, no events reach listeners.
- **Race test restores the spy.** The `read.mockRestore()` call after the assertion is critical — without it, subsequent tests in the file would inherit the one-shot mock.
- **Menu vs. door split.** The override *menu* (`withActions`) and the override *door* (`overrideStatus`) share the same stock guard. Tests verify both: the menu hides invalid targets, and the door still returns 409 if called directly.
