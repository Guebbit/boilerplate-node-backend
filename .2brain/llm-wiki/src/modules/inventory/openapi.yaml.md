---
source: src/modules/inventory/openapi.yaml
sha256: 33ce208ca42761452e34aa5b6847560372f9a1abe0e4d323b680a4509a13fafe
generated_at: 2026-09-27T14:55:44.465044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the inventory module (v2.0.0). It defines the admin-facing API surface for reading stock levels, auditing the movement ledger, and performing the three counter mutations (receive, adjust, sweep). The inventory module is the sole writer of `Product.onHand` and `Product.reserved`; this spec is the single source of truth for how those counters are read and changed.

## Key elements

- **`GET /inventory/levels`** (`listInventoryLevels`) — Paged list of products with `onHand`, `reserved`, and derived `available`. Filterable by `lowOnly` (at/below deployment threshold). Sorted most-scarce-first.
- **`GET /inventory/movements`** (`listStockMovements`) — Paged, append-only ledger of counter changes. Filterable by `productId` and `reason`. `meta.totalItems` reflects the full matching set, not just the current page.
- **`POST /inventory/receipts`** (`receiveStock`) — Records a supplier delivery; increments `onHand` only. The only transition that can create units.
- **`POST /inventory/adjustments`** (`adjustStock`) — Signed stocktake correction on `onHand`. Returns **409** if the result would drive `onHand` below the current `reserved`.
- **`POST /inventory/reservations/sweep`** (`sweepReservations`) — Expires all holds past their window and reports how many were released. Idempotent. Intentionally an admin endpoint with no internal scheduler — callers (cron, platform job, operator) drive it.
- **`StockMovementReason`** — Enum: `reserve`, `commit`, `release`, `expire`, `receive`, `adjust`, `restock`. Each maps to a fixed pair of signed deltas on the two counters (documented in the schema description; the canonical mapping lives in `domain/transitions.ts`).
- **`StockMovement`** — One append-only ledger row. Both `onHandDelta` and `reservedDelta` are always present (one may be zero), making the ledger replayable: summing each column over a product's rows reproduces the counter.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced for shared `PageParam`, `PageSizeParam`, `Id` schema, standard error responses (`Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `InternalError`, `ErrorResponse`), and the common `ErrorResponse` body used by the 409 on adjustments. The module spec re-exports none of these; it only consumes them via `$ref`.

## Notes

- Every endpoint requires `bearerAuth`; there is no public/customer-facing path in this spec (customers see `available` on the product itself, not here).
- The movement ledger is strictly append-only — there is no update or delete path. Corrections are made by the next movement row.
- The sweep endpoint has no `requestBody` and no `404`/`422` responses; it is a bare admin trigger.
- `additionalProperties: false` is set on the schema objects, so consumers should not expect undocumented fields.
