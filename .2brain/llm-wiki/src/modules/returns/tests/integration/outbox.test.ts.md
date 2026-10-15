---
source: src/modules/returns/tests/integration/outbox.test.ts
sha256: 230041860040a9d4b17ba9e690aa2f5d99c3a23031eb57a24405a3e8e9d19e24
generated_at: 2026-10-15T11:59:39.333718+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/outbox.test.ts

## Purpose

Integration tests that verify the transactional outbox guarantees for return domain events (`RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`). Confirms each event row is committed atomically with the write it announces, is keyed on the order ID for ordering, and is delivered to `onDomainEvent` subscribers via the relay. Runs against a real MongoDB instance.

## Key elements

- **`orderIn(status)`** – Helper that creates a user, a two-shirt product, and an order in the given `OrderStatus` (advancing through `carryOrderTo` for shipped/delivered), then sets a 7-day withdrawal window.
- **`returnRows()`** – Queries `outboxEventModel` for the three return event names, sorted by `_id`, returning lean documents.
- **`approvedReturn()`** – Creates a delivered order, opens a defective-goods return, and approves it as admin; returns the return ID and order ID.
- **`describe('return.requested')`** – Verifies the event is written in the same transaction as the return (row present, status `published`) and delivered to a subscriber with the correct payload and `eventId`; also verifies no return row remains when the outbox write is forced to fail.
- **`describe('a withdrawal before dispatch')`** – Verifies a pre-dispatch withdrawal writes both `RETURN_REQUESTED` and `RETURN_CLOSED` rows, both keyed on the order.
- **`describe('return.received and return.closed')`** – Verifies the full receive→close lifecycle produces all three rows; confirms the return stays `approved` with no `RETURN_RECEIVED` row if the event write fails; confirms a second `closeReturn` call is a no-op (only one `RETURN_CLOSED` row).

## Relationships

- **`src/kernel/outbox.ts`** – `outboxEventModel` is queried for assertions and spied on to simulate write failures; `settleOutboxNudges()` flushes pending relay publishes so the test can assert on delivered events.
- **`src/kernel/events.ts`** – `onDomainEvent` registers a subscriber to verify the relay delivers the event payload and `eventId`.
- **`src/modules/returns/services/index.ts`** – Exports `createReturn`, `approveReturn`, `receiveReturn` under test.
- **`src/modules/returns/services/close.ts`** – `closeReturn` is called directly to test idempotent closing.
- **`src/modules/returns/events.ts`** – Provides the three event name constants used in queries and assertions.
- **`src/modules/returns/repository.ts`** – `returnRepository` is used to assert domain state after atomicity-failure scenarios.
- **`src/modules/returns/module.ts`** – `returnsModule` is registered in `registerCheckoutModules` before each test.
- **`src/modules/payments/module.ts`** – Also registered so the checkout module graph is complete.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `setWithdrawUntil` build the order fixture.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` transitions the order to shipped/delivered, creating real shipment documents.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the shirt SKU.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates the customer.

## Notes

- Only the mailer adapter is mocked; everything else (MongoDB, outbox relay, domain services) runs for real.
- Atomicity is tested by spying on `outboxEventModel.create` and rejecting once with a synthetic "disk full" error — the expectation is that the domain write rolls back alongside the event row.
- The `customers` counter guarantees a unique email per test to avoid unique-index collisions across tests.
- `settleOutboxNudges()` must be awaited after each service call that writes an event; without it the relay may not have published yet and assertions on subscriber delivery will be racy.
- For shipped/delivered orders the helper routes through `carryOrderTo` rather than setting the status directly, ensuring shipment documents exist (the module docblock calls this "through the real doors").
