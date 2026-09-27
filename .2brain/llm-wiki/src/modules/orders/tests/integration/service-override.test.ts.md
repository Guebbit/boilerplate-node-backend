---
source: src/modules/orders/tests/integration/service-override.test.ts
sha256: 77be4d72c8bb52b2e1ec32eccf080d6e1a63e2baabe0bf39a95d773231cbdbbc
generated_at: 2026-09-27T15:19:54.052862+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-override.test.ts

## Purpose

Integration tests for the admin-override service (`overrideStatus` and `forceMove`). Uses a real MongoDB instance rather than mocks because the critical guarantee is the atomic conditional write, and a mock cannot race against itself. Mirrors the rationale already established in `service-status.test.ts`.

## Key elements

- **`setupTestDb()`** — boots a real Mongo for the test run (from `tests/support/setup-test-db.ts`).
- **`afterEach(() => resetDomainEvents())`** — tears down any event-bus subscriptions after each test.
- **`describe('overrideStatus')`** — four cases:
  - Forward move records a `statusOverrides` entry and emits exactly one `ORDER_STATUS_CHANGED` event with `{ orderId, from, to }` (no extra flags).
  - Refuses a move *into* `OrderStatus.paid` (system-only destination).
  - Refuses a backward move (e.g. `shipped → processing`).
  - Confirms no parcel/shipment record is created — status-only door.
- **`describe('forceMove')`** — three cases:
  - Jumps an order past a status the normal lifecycle would refuse (e.g. `paid → shipped`), recording `mode: 'forced'`.
  - Returns `null` when the order has already moved past the target.
  - Returns `{ success: false, status: 403 }` when the caller lacks `orders.any.override`, proving the check lives inside `forceMove` itself and does not depend on an upstream gate.

## Relationships

- **`src/modules/orders/services/override.ts`** — system under test; provides `overrideStatus` and `forceMove`.
- **`src/modules/orders/events.ts`** — supplies the `ORDER_STATUS_CHANGED` constant used to subscribe and assert event payloads.
- **`src/kernel/events.ts`** — supplies `onDomainEvent` / `resetDomainEvents` for in-process event-bus assertions.
- **`src/modules/orders/tests/factories.ts`** — supplies `seedOrder` (insert a fixture order) and `readOrder` (verify stored state after the operation).
- **`src/types/index.ts`** — supplies the `OrderStatus` enum used in assertions.
- **`tests/support/callers.ts`** — supplies `callerContextAs(role, id)` to build permission-bearing caller contexts.
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb` for the real-Mongo integration environment.

## Notes

- The `ORDER_STATUS_CHANGED` payload deliberately carries **no** `override` or `mode` field; downstream listeners (e.g. webhooks) key only on `to`. Do not expect the event to distinguish a status-only override from a forced delivery-door move.
- `forceMove` enforces the `orders.any.override` permission **internally**. The 403 test uses a `warehouse` caller that holds `delivery.any.update` but not `orders.any.override`, confirming the check is not delegated to a caller-side gate.
- `paid` is a system-only destination for `overrideStatus`; any attempt to override *into* it must fail regardless of the source status.
