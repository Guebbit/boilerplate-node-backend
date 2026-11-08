---
source: src/modules/returns/tests/integration/restock.test.ts
sha256: d32344527f95162600176b717492a12228cec91546f20f2434f01aaf2e2100db
generated_at: 2026-11-08T08:10:29.678301+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/restock.test.ts

## Purpose

Integration tests for the **receive-return** flow that verify how per-line restock counts affect sellable inventory, refund amounts, inventory ledger movements, audit metadata, and backorder fulfilment. The core invariant under test: restock count governs the *goods* (shelf units, backorder claims), never the *money* (refund is always the full order total).

## Key elements

- **`approvedReturn()`** — Builds a fully-delivered order (2 × shirt 30.00, 1 × mug 10.00) with a confirmed card payment, then creates and approves a defective-goods return. Returns all entities needed by the test.
- **`lucaReturnsWhileAnnaWaits()`** — Builds a single-unit lamp scenario: Luca buys the only on-hand unit, Anna pays and backorders a second. Luca's defective-goods return is approved. Exercises `inventoryService.setBackorderLimit`, `commitForOrder`, and spill reservations.
- **`annaHoldKinds(annaOrderId)`** — Reads Anna's reservation items via `reservationRepository.findByOrderId` and maps them to their `kind` (`backorder` | `stock`).
- **`describe('receiving with a restock count')`** — Four tests: partial restock records per-line counts; empty lines defaults to full restock; restock 0 produces no inventory movement and the same refund; audit row carries a `metadata.restocked` array.
- **`describe('a restock count that cannot stand')`** — Validation: unknown product ID, restock exceeding line quantity, and duplicate product in the lines array all return 422 with `RETURN_RESTOCK_INVALID` and leave the return in `approved` status (no partial write).
- **`describe('a broken unit and a waiting backorder')`** — Restocking the lamp flips Anna's hold from `backorder` to `stock`; restocking 0 leaves it as `backorder` and `onHand` at 0.

## Relationships

- **`src/modules/returns/module.ts`** — Imported as `returnsModule` and registered in `beforeEach` alongside the payments module so the return service is wired into the test container.
- **`src/modules/returns/repository.ts`** — `returnRepository.findById` is used to assert persisted line-level `restocked` counts and post-rejection `status`.
- **`src/modules/inventory/index.ts`** — Provides `inventoryService` for reservations, backorder limits, `commitForOrder`, and `listMovements` assertions.
- **`src/modules/inventory/tests/factories.ts`** — Provides `reservationRepository` to inspect Anna's hold kinds directly.
- **`src/modules/payments/index.ts`** — Provides `paymentService` for creating/confirming intents and reading `amountRefunded`.
- **`src/modules/payments/module.ts`** — Imported as `paymentsModule` and registered so the payment service participates in the checkout module graph.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes queued outbox entries after `approveReturn` so downstream side-effects are observable.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the domain-event bus in `afterEach`.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` captures `AuditEntry` objects into the `audited` array; `beforeEach` resets it.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo(orderId, 'delivered')` advances the order to the state required before a return can be created.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the initial purchase.
- **`src/modules/products/tests/factories.ts`** — `createProduct` (with `onHand`, `allowBackorder`) and `countersOf` (reads `onHand`) set up and assert shelf state.

## Notes

- The `customers` counter ensures unique e-mail addresses across tests that share the same in-memory DB; it is never reset.
- `registerAuditSink` is called in `beforeEach` and replaces any prior sink; the `audited` array is cleared on the same tick, so tests must not rely on audit rows from prior cases.
- The 422 validation tests assert that **no** inventory movement occurs on rejection (the return stays `approved`, `onHand` unchanged), confirming all-or-nothing semantics.
- `settleOutboxNudges` is only called inside `approvedReturn()` (after approval); it is *not* called after `receiveReturn`, implying the receive path does not enqueue further outbox entries that the tests depend on.
