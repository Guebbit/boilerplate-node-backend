---
source: src/modules/returns/tests/integration/outbox.test.ts
sha256: 6ddcdf429cc5fe8f9944cbb19e07516bcff9a77872845996dfd12cfd1928dfaf
generated_at: 2026-11-08T08:09:12.541261+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/outbox.test.ts

## Purpose
Integration tests (against a real MongoDB) that verify return domain events are written to the transactional outbox atomically with their corresponding state changes, keyed by `orderId` for per-order ordering, and delivered to subscribers via the outbox relay. Also confirms that when the outbox write fails, the entire transaction rolls back (no partial state).

## Key elements
- **`orderIn(status)`** – Creates a customer, a product, and an order (two units) forced to a given `OrderStatus`; for shipped/delivered it first runs `carryOrderTo` so shipments exist, then extends the withdrawal window 7 days.
- **`returnRows()`** – Queries `outboxEventModel` for the three return event names (`RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`), sorted by `_id`.
- **`approvedReturn()`** – End-to-end helper: delivered order → create defective return → approve it. Returns the return id, order id, and product.
- **`describe('return.requested')`** – Verifies the event row is keyed on the order, published, and that the subscriber (via `onDomainEvent`) receives the correct payload and `eventId`. Second test: simulating a `create` failure rolls back the return document.
- **`describe('return.decided')`** – Parametrized over `approved` / `declined`; asserts a single `RETURN_DECIDED` row with the right `payload.decision`. Also asserts a second approve on an already-decided return does not write a duplicate row.
- **`describe('a withdrawal before dispatch')`** – Paid-order withdrawal produces exactly two outbox rows (requested + closed), both keyed on the order.
- **`describe('return.received and return.closed')`** – Verifies receive → restock → close chain writes three rows in order; a `create` failure leaves stock and status untouched; `closeReturn` idempotency (second call resolves `null`, no extra row).
- **`jest.mock('@infrastructure/adapters/mailer')`** – Silences email side-effects.
- **`setupTestDb()` / `registerCheckoutModules`** – Real Mongo + module wiring in `beforeEach`.

## Relationships
- **`src/kernel/events.ts`** – `onDomainEvent` subscribes to events to assert relay delivery and payload shape.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is the persistence target under test; `settleOutboxNudges` flushes the relay so assertions run after publication.
- **`src/modules/returns/module.ts`** & **`src/modules/payments/module.ts`** – Registered together via `registerCheckoutModules` so cross-module event routing is exercised.
- **`src/modules/returns/services/index.ts`** – `returnService` (`createReturn`, `approveReturn`, `declineReturn`, `receiveReturn`) is the primary actor.
- **`src/modules/returns/services/close.ts`** – `closeReturn` used for the idempotent-close test.
- **`src/modules/returns/events.ts`** – Supplies the four event-name constants used in queries and assertions.
- **`src/modules/returns/repository.ts`** – `returnRepository` used to confirm rolled-back / persisted document state.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `setWithdrawUntil`, `toOrderItem`.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` to produce real shipment records.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `countersOf` (stock-level checks).
- **`src/modules/users/tests/factories.ts`** – `createUser`.
- **`tests/support/callers.ts`** – `asCustomer`, `callerContextAs`, `testCallerContext` for authentication context.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules`.
- **`src/types/index.ts`** – `OrderStatus` enum for the `orderIn` helper.

## Notes
- `settleOutboxNudges()` **must** be awaited after every service call before asserting on outbox rows; without it the relay may not have published yet.
- The "disk full" failure is injected by spying on `outboxEventModel.create`; because the service and outbox write share a transaction, a single failure rolls back the return document *and* any stock change atomically.
- `orderIn` treats `shipped`/`delivered` specially: it creates the order in `processing` first, then calls `carryOrderTo` so that real shipment documents exist (the service under test may inspect them).
- The module doc-block references `docs/tools/outbox.md` for the broader outbox design rationale.
