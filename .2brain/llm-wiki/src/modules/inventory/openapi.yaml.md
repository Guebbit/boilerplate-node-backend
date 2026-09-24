---
source: src/modules/inventory/openapi.yaml
sha256: 8b71cfe7d8f18765845dbfdbd391511eb3c512811b1fe76b6f025a987097759a
generated_at: 2026-09-23T18:45:32.201401+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the inventory module (v2.0.0). It defines the sole write surface for the two product counters `onHand` and `reserved`, the append-only stock-movement ledger, and the reservation-sweep endpoint. Every endpoint is bearer-authenticated and admin-facing; customers read availability off the product itself.

## Key elements

- **`GET /inventory/levels`** (`listInventoryLevels`) — Paged list of product counters, most scarce first. Supports `lowOnly` boolean filter to surface items at or below the low-availability threshold.
- **`GET /inventory/movements`** (`listStockMovements`) — Paged, newest-first ledger. Filterable by `productId` and `reason`. `meta.totalItems` counts all matching rows, not just the returned page.
- **`POST /inventory/receipts`** (`receiveStock`) — Records a supplier delivery; increments `onHand`, leaves `reserved` unchanged. The only transition that creates units.
- **`POST /inventory/adjustments`** (`adjustStock`) — Signed stocktake correction on `onHand`. Returns **409** if the correction would drop `onHand` below the current `reserved` value (reserved units are promised to existing orders).
- **`POST /inventory/reservations/sweep`** (`sweepReservations`) — Idempotent; releases every hold past its expiry window and returns the count of expired holds. Intended to be triggered externally (cron, platform scheduler) since the application ships no internal timer.
- **`StockMovementReason`** (enum) — `reserve | commit | release | expire | receive | adjust`. Each value implies a fixed pair of signed deltas, documented inline and mapped in `domain/transitions.ts`.
- **`StockMovement`** (schema) — One append-only ledger row: `id`, `productId`, `reason`, `onHandDelta`, `reservedDelta`, optional `reference` (order id), `note`, timestamps. No update path exists; corrections are new rows.
- **`StockMovementsResponse`** (schema) — Standard paged envelope (`items` + `meta`).
- Other schemas referenced but truncated in this view: `InventoryLevelsResponseEnvelope`, `InventoryLevelEnvelope`, `ReceiptRequest`, `AdjustmentRequest`, `ReservationSweepEnvelope`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Imported via `$ref` for:
    - Shared parameters: `PageParam`, `PageSizeParam` (pagination on both GET endpoints).
    - Shared response objects: `Unauthorized`, `Forbidden`, `InternalError`, `ValidationError`, `NotFound` (used across all five endpoints).
    - Shared schemas: `Id` (used in `StockMovement` fields and the `productId` filter), `ErrorResponse` (used in the 409 body of `/inventory/adjustments`).
    - The inventory module is the **sole writer** of `Product.onHand` and `Product.reserved`; the `products` module owns the collection and reads those fields but does not mutate them.

## Notes

- The ledger is explicitly **replayable**: summing `onHandDelta` (or `reservedDelta`) over a product's rows must reproduce the current counter. This invariant is asserted in the module's tests.
- `StockMovement` records **both** deltas on every row (one may be zero) rather than a single signed number — this is what makes per-counter replay possible.
- The sweep endpoint is deliberately an admin HTTP endpoint, not an internal cron, because the application has no built-in scheduler. Running it multiple times is safe (idempotent).
- All paths require `bearerAuth`; there is no public (unauthenticated) surface in this contract.
