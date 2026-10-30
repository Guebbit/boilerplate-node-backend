---
source: src/modules/returns/tests/integration/outbox.test.ts
sha256: 169445fd1ed5267d3920e4586c377b1b3c833e7c77c0b1ade48bba684560c5fc
generated_at: 2026-10-29T05:47:50.005125+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/outbox.test.ts

## Purpose

Integration test that verifies return domain events ride the transactional outbox: each event row commits atomically with the write it announces, is keyed on the order so per-order events stay in sequence, and is delivered to the event bus (and webhook fan-out) through the relay. Runs against a real MongoDB instance.

## Key elements

- **`orderIn(status)`** – Creates a customer, a single "Shirt" product, and a two-item order forced to the given `OrderStatus`. If the status implies shipping (shipped/delivered), it carries the order through the delivery factory. Sets a 7-day withdrawal window.
- **`returnRows()`** – Queries `outboxEventModel` for the three return events (`RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`), sorted by `_id`.
- **`approvedReturn()`** – Convenience: opens a defective-goods return on a delivered order and approves it as admin; returns the IDs needed by downstream tests.
- **`describe('return.requested')`** – Asserts the event is written atomically with the return document, carries the correct payload/aggregate key, is `published`, and reaches a live `onDomainEvent` subscriber after `settleOutboxNudges()`. Also asserts that if the outbox write fails, no return document persists.
- **`describe('return.decided')`** – Parametrized over approve/decline; asserts a single `RETURN_DECIDED` row with the right `decision` payload. Verifies a duplicate (lost-race) decision writes no additional row.
- **`describe('a withdrawal before dispatch')`** – A `paid`-status order that is returned and immediately closed produces exactly two outbox rows (requested, then closed), both `published`.
- **`describe('return.received and return.closed')`** – Verifies the receive→restock→close sequence writes three rows in order; confirms stock counters change atomically with the receipt; confirms a failed outbox write rolls back both the status and the restock; confirms a second `closeReturn` call is a no-op (only one `RETURN_CLOSED` row).
- **`customers`** – Module-level counter ensuring each test customer gets a unique email address.

## Relationships

- **`src/kernel/outbox.ts`** – Provides `outboxEventModel` (the Mongo model the tests query/spy on) and `settleOutboxNudges` (flushes the relay so assertions can run against published rows).
- **`src/kernel/events.ts`** – Provides `onDomainEvent`, used to register a live subscriber and verify the relay actually dispatched the payload.
- **`src/modules/returns/events.ts`** – Source of the event-name constants (`RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`, `RETURN_DECIDED`).
- **`src/modules/returns/services/index.ts`** – `returnService` is the primary API under test (create, approve, decline, receive).
- **`src/modules/returns/services/close.ts`** – `closeReturn` used in the idempotency test.
- **`src/modules/returns/repository.ts`** – `returnRepository` used to assert persistence (or absence) of the return document.
- **`src/modules/returns/module.ts`** – The module registered in `beforeEach` so the service is wired for the test.
- **`src/modules/payments/module.ts`** – Co-registered via `registerCheckoutModules`; required for the full checkout pipeline to resolve.
- **`src/modules/users/tests/factories.ts`** – `createUser` for test customers.
- **`src/modules/products/tests/factories.ts`** – `createProduct` and `countersOf` (stock assertions).
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `setWithdrawUntil`, `toOrderItem`.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` to advance an order through shipping states.
- **`src/types/index.ts`** – `OrderStatus` enum used in helper signatures.
- **`tests/support/callers.ts`** – `asCustomer`, `testCallerContext`, `callerContextAs` for auth context.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` to wire the module registry per test.

## Notes

- Uses **real MongoDB** (`setupTestDb`); the mailer adapter is the only mocked infrastructure dependency.
- `settleOutboxNudges()` must be awaited after every write before asserting on outbox rows; forgetting it leaves rows in the `pending` state.
- Atomicity tests work by spying on `outboxEventModel.create` and rejecting once — this simulates a disk failure mid-transaction.
- The restock (stock-counter increment) lives inside the receipt's transaction; the test explicitly verifies counters are unchanged when the outbox write fails, confirming the unit is not double-sold.
- The `customers` counter is module-level and never reset; each test gets a globally unique email to avoid upsert collisions in `createUser`.
