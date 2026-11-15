---
source: src/modules/returns/tests/integration/restock.test.ts
sha256: 647624242aa319c978cf054e9bf8c306aef9425af872a870d648fe11eba56ae6
generated_at: 2026-11-14T21:47:00.649966+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/restock.test.ts

## Purpose

Integration tests for the restock step of return receipt. They verify how many returned units are put back on sale (per-line `restock` count vs. full restock vs. zero), that the refund amount is independent of the restock decision, that hard-deleted products are handled gracefully, that invalid restock entries are rejected without side effects, and that a restocked unit never satisfies a pending backorder claim in the same transaction.

## Key elements

- **`approvedReturn()`** — End-to-end fixture: creates a user, two products, a paid + delivered order, and an approved defective-goods return. Returns all IDs for downstream assertions.
- **`hardDeleteShirt(shirt)`** — Deletes the product *and* removes its stock-level row, simulating a true hard delete.
- **`lucaReturnsWhileAnnaWaits()`** — Backorder fixture: one unit on shelf bought by Luca; Anna pays for a second unit (spill reservation + commit) so she holds a backorder claim while Luca's return is approved.
- **`describe('receiving with a restock count')`** — Four cases: partial restock (1 of 2 shirts), full restock (no lines given), zero restock (refund unchanged, no inventory movement), and audit-log metadata includes per-line restocked counts.
- **`describe('receiving a return of a product that has since been hard-deleted')`** — Parameterised over "no lines" and "a restock count for the deleted line"; asserts no stock movement, no level row, return still closes with full refund.
- **`describe('a restock count that cannot stand')`** — Validation: unknown product ID, quantity exceeding the line, and duplicate product in lines all return 422 `RETURN_RESTOCK_INVALID` with a `field` pointer; the return stays in `approved` status and inventory is untouched.
- **Truncated describe block** — Asserts that a restocked unit is *not* allocated to Anna's backorder hold in the same transaction (the unit's level kind transitions away from `stock` before the backorder can claim it).

## Relationships

- **`src/modules/returns/module.ts`** — `returnsModule` is registered in `registerCheckoutModules` so the return service is wired into the test's checkout pipeline.
- **`src/modules/inventory/index.ts`** — `inventoryService` provides `reserveForOrder`, `commitForOrder`, `listMovements`, and `setBackorderLimit` used in fixtures and assertions.
- **`src/modules/inventory/repository.ts`** — Backing store for the stock-level rows that `stockLevelRepository.findByProductId` (imported via the factories) reads; its absence is the key assertion in the hard-delete tests.
- **`src/modules/inventory/tests/factories.ts`** — `removeLevel`, `reservationRepository`, `stockLevelRepository` for direct inventory-state setup and assertions.
- **`src/modules/payments/index.ts`** — `paymentService` used to create/confirm intents and to read `amountRefunded` after receipt.
- **`src/modules/payments/module.ts`** — `paymentsModule` co-registered alongside `returnsModule` for the checkout pipeline.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes async outbox work before receive-step assertions.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears the event bus between tests.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` captures `AuditEntry[]` so tests can assert on per-line restocked metadata in the audit log.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf`, `deleteProduct` for product setup and on-hand checks.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` for order construction.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo(orderId, 'delivered')` advances the delivery state machine to the "received" prerequisite.

## Notes

- A module-level `customers` counter ensures each fixture call uses a unique email, avoiding user-collision errors across tests.
- `hardDeleteShirt` is intentionally *not* a soft delete: it removes both the product document and the stock-level row, so any code path that reads the level must handle a null.
- Validation tests assert the return status is still `'approved'` after a 422 — confirming `receiveReturn` is atomic (no partial state change on rejection).
- The audit assertion checks `metadata.restocked` is an array of `{ productId, restocked }` objects, including the line that was *not* explicitly named (defaults to full quantity).
- `settleOutboxNudges` is called inside `approvedReturn()` to ensure any async outbox messages from the approval step are flushed before the receive step runs.
