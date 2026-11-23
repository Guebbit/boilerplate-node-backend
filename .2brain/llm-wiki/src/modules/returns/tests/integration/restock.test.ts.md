---
source: src/modules/returns/tests/integration/restock.test.ts
source_sha256: 647624242aa319c978cf054e9bf8c306aef9425af872a870d648fe11eba56ae6
context_sha256: de0335b1953973cc9e37eaa647a6fbd2da35c1b2468051e7714c106fc2736a73
generated_at: 2026-11-22T07:36:49.443458+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/restock.test.ts

## Purpose
Integration tests for the returns module's "restock count" behaviour when staff receive an approved return. Staff can choose how many returned units go back on sale per line; a broken unit set to 0 never reaches the shelf, so it is never handed to a backorder buyer in the same transaction. The refund amount is independent of the restock choice.

## Key elements
- `setupTestDb()` – sets up the test database for the suite.
- `beforeEach` / `afterEach` – register the payments and returns modules via `registerCheckoutModules`, register an audit sink that collects entries into `audited`, then reset domain events and restore mocks after each test.
- `approvedReturn()` – fixture helper. Creates a user, a shirt (30.00) and a mug (10.00) with 10 on hand each, and an order of 2 shirts + 1 mug. It reserves stock, creates and confirms a card payment, carries the order to `delivered`, creates a `defective` return and approves it, then calls `settleOutboxNudges()`. Returns `{ user, shirt, mug, orderId, id }`.
- `hardDeleteShirt()` – deletes the product and removes its stock level row, simulating a hard delete.
- `lucaReturnsWhileAnnaWaits()` – fixture for the backorder scenario. A lamp has 1 unit on hand with backorders allowed. Luca buys and receives it, Anna then pays for another unit and holds a backorder claim (`spill: true`, then committed), and Luca's defective return is approved. Returns `{ lamp, lampId, annaOrderId, id }`.
- Test groups:
  - **receiving with a restock count**
    - Only the named quantity is restocked, and per-line `restocked` is recorded.
    - Unnamed lines go back in full.
    - Omitting `lines` restocks everything.
    - A line set to 0 writes no `restock` ledger row, and the same 70.00 is still refunded and the return closes.
    - The `admin.return.received` audit row carries per-line `restocked` counts in its metadata.
  - **hard-deleted product**
    - No stock moves and the line is still refunded (return `closed`, 70.00), with or without a restock count for the deleted line.
  - **a restock count that cannot stand**
    - An unknown product, a count above the line quantity, or a duplicate product is refused with 422 `RETURN_RESTOCK_INVALID`, with `details.field` pointing at the offending entry (e.g. `lines.0.restock`, `lines.1.restock`).
    - Nothing is received: the return stays `approved` and stock is unchanged.
  - A further backorder-related group starts after the `lucaReturnsWhileAnnaWaits` helper; the content shown ends mid-helper.

## Relationships
- `@kernel/outbox` (`settleOutboxNudges`) and `@kernel/events` (`resetDomainEvents`) – flush the outbox after setup and clear domain-event state between tests.
- `@infrastructure/observability/audit` – `registerAuditSink` and `AuditEntry` capture audit rows for assertion.
- `@modules/inventory` (`inventoryService`) – reserves, commits and sets backorder limits during setup, and `listMovements` is used to check for `restock` ledger rows.
- `@modules/inventory/tests/factories` – `removeLevel`, `reservationRepository` and `stockLevelRepository`, used for stock-level setup and checks.
- `@modules/payments` (`paymentService`) and `payments/module` – create and confirm payment intents, and read `amountRefunded` after receipt. The module is registered for the tests.
- `returns/module`, `../../services` (`returnService`) and `../../repository` (`returnRepository`) – the system under test: `createReturn`, `approveReturn`, `receiveReturn`, and `findById` to read stored lines and status.
- Product, order and delivery test factories (`createProduct`, `countersOf`, `deleteProduct`, `createOrder`, `toOrderItem`, `carryOrderTo`) – build fixtures and read stock counters.

## Notes
- The `customers` counter keeps email addresses unique per test.
- A hard-deleted product is not a failure: the return still closes and refunds the line.
- Setup goes through the real inventory and payment services rather than writing data directly, so the fixtures follow the production flow from reservation through delivery.
