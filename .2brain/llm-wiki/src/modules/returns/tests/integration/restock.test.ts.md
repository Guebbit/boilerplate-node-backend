---
source: src/modules/returns/tests/integration/restock.test.ts
sha256: a3efc383618c116ca2655bef998e0dc87d935bffea30235979067c8bf3fe15be
generated_at: 2026-10-29T05:48:46.359311+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/restock.test.ts

## Purpose

Integration tests for the **restock decision** made when an approved return is received: staff specify per-line how many units are sellable (`restock` count), and the system must (a) restock only that many into inventory, (b) still refund the full order amount regardless, (c) write correct audit metadata, (d) reject invalid counts with a 422, and (e) allocate or withhold a backorder claim depending on whether the unit is restocked.

## Key elements

- **`approvedReturn()`** — shared helper that walks a buyer through order → inventory reserve → card payment → delivery → return creation → admin approval → `settleOutboxNudges()`, returning references to the user, two products (shirt ×2, mug ×1), the order id, and the return id.
- **`lucaReturnsWhileAnnaWaits()`** — builds a single-unit lamp scenario: Luca buys and receives the last on-hand unit; Anna then pays for a backorder claim (`spill: true`). Luca's defective-goods return is approved and ready to receive. Returns the lamp, Anna's order id, and the return id.
- **`annaHoldKinds(annaOrderId)`** — reads Anna's reservation items and returns their `kind` values (`'backorder'` vs `'stock'`) to assert allocation state.
- **`describe('receiving with a restock count')`** — four tests: partial restock records per-line counts; empty `lines` defaults to full restock; `restock: 0` writes **no** inventory ledger movement yet refunds the same amount; the audit row's `metadata.restocked` array mirrors the per-line counts.
- **`describe('a restock count that cannot stand')`** — validation tests: unknown product id, count exceeding the line quantity, and duplicate product id all yield a 422 with `RETURN_RESTOCK_INVALID` and a `details.field` pointing at the offending entry (`lines.0.restock` / `lines.1.restock`). State is unchanged (return stays `approved`, no inventory change).
- **`describe('a broken unit and a waiting backorder')`** — restocking the lamp flips Anna's hold from `backorder` → `stock`; setting `restock: 0` leaves her at `backorder` and `onHand` at 0.

## Relationships

- **`src/modules/returns/module.ts`** / **`src/modules/returns/repository.ts`** — `returnsModule` is registered in `beforeEach`; `returnService` (from `../../services`) drives every assertion; `returnRepository.findById` is used to inspect stored line counts and status.
- **`src/modules/inventory/index.ts`** / **`src/modules/inventory/services/index.ts`** — `inventoryService` provides `reserveForOrder`, `setBackorderLimit`, `commitForOrder`, and `listMovements`; `countersOf` (from products factories) reads `onHand`.
- **`src/modules/inventory/repository.ts`** / **`src/modules/inventory/tests/factories.ts`** — `reservationRepository.findByOrderId` exposes Anna's hold items and their `kind` for backorder assertions.
- **`src/modules/payments/index.ts`** / **`src/modules/payments/module.ts`** / **`src/modules/payments/services/index.ts`** — `paymentService` creates and confirms the payment intent; `paymentsModule` is registered so the payment flow works in-test.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes outbox messages after approval so the return reaches `approved` state before receiving is tested.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` prevents cross-test event leakage.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` captures entries into the module-level `audited` array; one test asserts the `restocked` array in the `admin.return.received` row.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo(orderId, 'delivered')` advances the order to the state required before a return can be created.
- **`src/modules/products/tests/factories.ts`** / **`src/modules/orders/tests/factories.ts`** — `createProduct`, `countersOf`, `createOrder`, `toOrderItem` build the fixture data.

## Notes

- The file-level doc comment states the core invariant explicitly: *restock is about the goods, not the money* — a `restock: 0` line still refunds the full amount and writes **no** inventory movement row for that line.
- `approvedReturn()` increments a module-level `customers` counter so each call produces a unique email; this is the only state shared between tests besides `audited`.
- The duplicate-product test asserts the error points at `lines.1` (the second occurrence), not `lines.0`, verifying the service reports the first *conflicting* entry.
- The backorder scenario relies on `inventoryService.setBackorderLimit(lampId, null)` (no cap) and a `spill: true` reservation to create the backorder hold; `annaHoldKinds` is the sole oracle for whether the hold was satisfied.
