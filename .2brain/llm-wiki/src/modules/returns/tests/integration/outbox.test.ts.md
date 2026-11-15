---
source: src/modules/returns/tests/integration/outbox.test.ts
sha256: 2d4e84a5ca687dc6f6dead341218c43a64e7297812fc82cbe51276226f3b81c4
generated_at: 2026-11-14T21:44:25.038616+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/outbox.test.ts

## Purpose

Integration test that verifies return domain events (`return.requested`, `return.decided`, `return.received`, `return.closed`) are written atomically to the transactional outbox, keyed on the order ID, and delivered through the relay to subscribers. Uses a real Mongo instance (via `setupTestDb`) so that the outbox commit/rollback semantics and relay fan-out are exercised end-to-end.

## Key elements

- **`orderIn(status)`** — helper that creates a customer, a product, and an order in the given `OrderStatus`; for shipped/delivered it also runs `carryOrderTo` so real shipment records exist; sets the withdrawal window 7 days out.
- **`returnRows()`** — queries `outboxEventModel` for the three return event names, sorted by `_id` (insertion order).
- **`approvedReturn()`** — shorthand for a delivered order + created + approved return, returning `{ id, orderId, shirt }`.
- **`describe('return.requested')`** — asserts the event row is written in the same transaction as the return document (atomicity), keyed on `orderId`, and that the relay delivers the payload to an `onDomainEvent` subscriber. Also verifies no orphan return row survives a failed outbox write.
- **`describe('return.decided')`** — parameterized over approve/decline; asserts one `RETURN_DECIDED` row with the correct `decision` field. Also asserts a duplicate decision (lost race) does not produce a second row.
- **`describe('a withdrawal before dispatch')`** — a paid order that is withdrawn produces exactly two outbox rows: `RETURN_REQUESTED` then `RETURN_CLOSED`, both `published`.
- **`describe('return.received and return.closed')`** — verifies that receiving a return writes `RETURN_RECEIVED` *and* triggers restock (product counters change) in the same transaction, then `RETURN_CLOSED` once settlement completes. Confirms atomic rollback (stock unchanged, no `RETURN_RECEIVED` row) when the outbox write fails. Confirms idempotent close: a second `closeReturn` call is a no-op (asserted via `toBeNull`) and produces no second `RETURN_CLOSED` row.

## Relationships

- **`src/kernel/events.ts`** — subscribes via `onDomainEvent` to observe relay delivery.
- **`src/kernel/outbox.ts`** — reads `outboxEventModel` rows directly; calls `settleOutboxNudges()` to flush the relay after each service call.
- **`src/modules/returns/services/index.ts`** — drives all domain operations (`createReturn`, `approveReturn`, `declineReturn`, `receiveReturn`).
- **`src/modules/returns/services/close.ts`** — calls `closeReturn` to test idempotent close.
- **`src/modules/returns/events.ts`** — imports the four event-name constants used in assertions and queries.
- **`src/modules/returns/repository.ts`** — verifies domain state after failed writes (no orphan return).
- **`src/modules/returns/module.ts`** — registered as a checkout module in `beforeEach`.
- **`src/modules/payments/module.ts`** — co-registered checkout module (settlement path for `close`).
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `setWithdrawUntil`.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf` (restock assertion).
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` for shipped/delivered orders.
- **`src/modules/users/tests/factories.ts`** — `createUser`.
- **`src/types/index.ts`** — `OrderStatus` enum.
- **`tests/support/callers.ts`** — `asCustomer`, `callerContextAs`, `testCallerContext` for auth contexts.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wiring.

## Notes

- Only the mailer adapter is mocked; the database, outbox, and relay are all real.
- `settleOutboxNudges()` must be awaited after every service call that writes an event, otherwise the relay has not yet published and assertions on subscriber calls will fail.
- The `customers` module-level counter guarantees unique emails across tests within the file (avoids unique-index collisions on a persistent test DB).
- Atomicity assertions rely on the outbox and domain write sharing a single transaction; the "disk full" mock on `outboxEventModel.create` simulates the outbox half of that transaction failing.
- Event ordering is asserted via `_id` sort (Mongo ObjectId timestamp), not a separate sequence column.
