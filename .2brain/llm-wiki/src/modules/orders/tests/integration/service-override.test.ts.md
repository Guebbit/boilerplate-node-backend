---
source: src/modules/orders/tests/integration/service-override.test.ts
sha256: 41b76cf0321571b7a69eddbca34f59aaf6dd1edaf11ac1a9dc04f5b34cc908b3
generated_at: 2026-09-23T19:12:25.507747+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-override.test.ts

## Purpose

Integration tests for the admin-order-override service (`orders/services/override.ts`). Runs against a real MongoDB instance to verify that the two override doors — `overrideStatus` (forward-only, status-only) and `forceMove` (skip-ahead) — perform correct conditional writes, record the expected `statusOverrides` history entries, and emit the right domain events.

## Key elements

- **`seedOrder(status)`** — local helper that creates a user, product, and order via the test factories and returns the order in the given `OrderStatus`.
- **`describe('overrideStatus')`** — four cases:
    - Forward move succeeds, writes one `statusOverrides` entry (`mode: 'status'`), and fires exactly one `ORDER_STATUS_CHANGED` event with `{ orderId, from, to }`.
    - Targeting `OrderStatus.paid` is refused (system-only destination).
    - Backward move (shipped → processing) is refused.
    - Moving to `shipped` leaves no shipment/parcel record (confirms it is the status-only door).
- **`describe('forceMove')`** — two cases:
    - Skips past a status the normal lifecycle would refuse (paid → shipped), recording `mode: 'forced'`.
    - Refuses if the order has already advanced beyond the target.
- **`setupTestDb()` / `afterEach(() => resetDomainEvents())`** — real-Mongo bootstrap and event-subscription cleanup.

## Relationships

- **`src/modules/orders/services/override.ts`** — the system under test; exports `overrideStatus` and `forceMove`.
- **`src/modules/orders/events.ts`** — provides the `ORDER_STATUS_CHANGED` constant used to subscribe and assert the emitted payload.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` drive the in-process event bus the tests observe and clean up.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `readOrder` build and inspect order documents.
- **`src/modules/users/tests/factories.ts`** — `createUser` supplies the order's owner.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the order line item.
- **`tests/support/callers.ts`** — `callerContextAs('admin', …)` fabricates the admin caller context passed to both service functions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions and tears down the real MongoDB used throughout.
- **`src/types/index.ts`** — `OrderStatus` enum used in assertions and seeds.

## Notes

- Deliberately uses **real Mongo** (same rationale as `service-status.test.ts`): the guarantee under test is the conditional write, which a mock cannot race against itself to falsify.
- The `ORDER_STATUS_CHANGED` payload contains **no `override` flag**. Downstream listeners (e.g. webhooks) key off `to` alone; status-only and forced deliveries are intentionally indistinguishable in the event.
- `overrideStatus` records `mode: 'status'`; `forceMove` records `mode: 'forced'` — the distinction lives in the `statusOverrides` array, not in the event.
- `paid` is hard-locked as a system-only destination; no admin override path may target it.
