---
source: src/modules/inventory/tests/integration/backorder-arrivals.test.ts
sha256: c4295409d213f5788a1d168f5e25605296277ec45c5a5d1628c2d826057e58d8
generated_at: 2026-10-29T04:06:10.994216+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/backorder-arrivals.test.ts

## Purpose

Integration test that verifies a single invariant: whenever stock becomes sellable through **any** write path (stocktake, return restock, hold expiry, order cancellation, partial-shipment release), the committed backorder buyer is served first, inside that write's own transaction. It exists to catch regressions where a code path forgets to drain the backorder queue.

## Key elements

- **`soldOutWithAPaidBuyerWaiting(shelf)`** — Shared setup: creates a product, optionally holds all shelf units under a "holder" order, then reserves 1 unit as `kind: 'backorder'` under a "waiting" order and commits it. Returns `{ productId, holder, waiting }`.
- **`anOrderId()`** — Returns a unique 24-char hex string (ObjectId-shaped) so reservations stay keyed per order.
- **`levelOf(productId)`** / **`itemsOf(orderId)`** — Read helpers wrapping `stockLevelRepository` and `reservationRepository` so assertions stay terse.
- **7 test cases** under `describe('a unit that becomes sellable', …)`:
  - Stocktake (`inventoryService.adjust`)
  - Returned-parcel restock (`inventoryService.restockReturnedLines`)
  - Unpaid hold expiry (`reservationModel.updateOne` → `inventoryService.runReservationSweep`)
  - Unpaid order cancel (`inventoryService.releaseForOrder`)
  - Paid order cancel (`inventoryService.releaseCommittedForOrder`)
  - Partial shipment cancel (`inventoryService.releaseLinesForOrder` with committed lines)
  - Negative: releasing a `kind: 'backorder'` line frees only allowance, not shelf units (no queue service occurs).

## Relationships

- **`src/modules/inventory/services/index.ts`** — `inventoryService` is the system under test; every scenario calls one of its write methods.
- **`src/modules/inventory/repository.ts`** — `stockLevelRepository` and `reservationRepository` back the `levelOf` / `itemsOf` assertion helpers.
- **`src/modules/inventory/model.ts`** — `reservationModel.updateOne` is used directly to force-expire a hold before triggering the sweep.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the transactional service calls (restock, committed release, partial release).
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the product inside `soldOutWithAPaidBuyerWaiting`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision the test database.
- **`tests/support/callers.ts`** — `testCallerContext` is passed to `inventoryService.adjust` to satisfy its caller-context parameter.

## Notes

- The file is `@module`-scoped (no exports); it is purely a test.
- `setupTestDb()` runs once at import time, not per-test — the suite assumes a clean DB per run.
- The negative test (last case) specifically guards against a subtle bug: releasing a backorder-kind line must **not** trigger queue fulfilment because no physical unit was freed.
- Docstring references `docs/modules/inventory-reservations.md#preorders` for the full reservation/backorder contract.
- `anOrderId` produces 24-char strings to match the "holds are keyed by one" assumption in the reservation schema.
