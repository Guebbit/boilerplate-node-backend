---
source: src/modules/orders/tests/integration/service-override.test.ts
source_sha256: cb6b7c4da5dc769d1d68b4001cdde767993059045477f23be0e4cf2f68235708
context_sha256: f30974444bd3fea496238acc8773977ff24515f55fc3564053a95a16e5e76c5e
generated_at: 2026-11-22T06:33:19.582841+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/service-override.test.ts

## Purpose
Integration tests for `overrideStatus` in `src/modules/orders/services/override.ts`, the admin status override. They run against a real Mongo database (via `setupTestDb`) because the guarantee under test is the conditional write, which a mock cannot race against itself.

## Key elements
- **Setup hooks**: `setupTestDb()` provisions the DB. `beforeEach` calls `markDomainEventsWired()` so the outbox relay delivers. `afterEach` calls `resetDomainEvents()`.
- **`overrideStatus on a digital-only order`**:
  - Refuses `shipped` with 409, leaving the status at `processing`.
  - Moving to `delivered` sets `withdrawUntil` to `2026-03-31T23:59:59.999Z`, counted from the payment date `2026-03-01T10:00:00Z`.
- **`overrideStatus`**:
  - A forward move succeeds, fires `ORDER_STATUS_CHANGED` with `{orderId, from, to}`, and appends one timeline entry. The entry has type `status_overridden`, the actor, the reason text, and `data: {from, to, mode: 'status'}`.
  - Refuses a move into `paid`.
  - Refuses any move out of `pending`.
  - Refuses a backward move.
  - Answers 409 and writes no history when a concurrent write lands between read and write. The test simulates this by spying on the repository's `findByIdScoped` and updating the order via `orderModel` after the read.
  - Records the stored pre-state as the history `from`.
  - Creates no parcel-side effect. The test only checks that the status changes to `shipped`.
- **`the override event`**:
  - `ORDER_STATUS_OVERRIDDEN` fires beside the status change, with `{orderId, from, to, at, mode: 'status'}`. `at` matches the timeline row's `at`.
  - While units await stock, the override to `shipped` is refused with 409 and code `ORDER_OVERRIDE_AWAITING_STOCK`, and nothing is written.
  - Moving to `processing` is still allowed while units await stock.
  - `withActions(...)` offers only `[OrderStatus.processing]` in `actions.overrideStatus` while units await stock, so `shipped` and `delivered` are left out of the menu.

## Relationships
- Exercises `src/modules/orders/services/override.ts` (`overrideStatus`) and `src/modules/orders/services/actions.ts` (`withActions`).
- Uses `src/modules/orders/model.ts` (`orderModel`) to alter or read state directly, and `src/modules/orders/repository.ts` (`orderRepository`), spying on its `findByIdScoped` for the race test.
- Imports `ORDER_STATUS_CHANGED` and `ORDER_STATUS_OVERRIDDEN` from `src/modules/orders/events.ts`.
- Uses `src/kernel/events.ts` (`onDomainEvent`, `markDomainEventsWired`, `resetDomainEvents`) and `src/kernel/outbox.ts` (`settleOutboxNudges`) to observe emitted events.
- Uses `src/modules/orders/tests/factories.ts` (`seedOrder`, `seedDigitalOrder`, `readOrder`, `timelineOf`), `tests/support/callers.ts` (`asAdmin`, `callerContextAs`) and `tests/support/setup-test-db.ts`.
- Uses `OrderStatus` from `src/types/index.ts`.

## Notes
- Events are delivered through the outbox. Tests must call `await settleOutboxNudges()` before asserting on handler payloads.
- `order.status_changed` stays the event all listeners read. The override emits `order.status_overridden` separately; the file's comment notes that `webhooks` filters on `to` alone.
- In the race test, the spy is restored manually with `read.mockRestore()` after the call.
