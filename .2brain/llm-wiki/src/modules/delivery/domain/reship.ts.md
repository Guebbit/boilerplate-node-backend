---
source: src/modules/delivery/domain/reship.ts
sha256: 4b6472d8f727880748042b69f3a70080c1dcc686db8db084ca3d366a24a68700
generated_at: 2026-10-29T03:34:07.496566+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/reship.ts

## Purpose

Pure domain logic for reshipping (replacement under legal guarantee): determines which physical fulfillment orders must be reopened to cover the units being sent again, and how the "owed" portion (what the shelf could not cover) is distributed back to those orders. Exists as a dependency-free module so every case is unit-testable without a database.

## Key elements

- **`ReopenableFulfillmentOrder`** — Minimal view of a fulfillment order: `id`, `physical` flag (digital orders are excluded), `number` (position; higher = later), and `lines`.
- **`Reopening`** — One fulfilled order's contribution: `fulfillmentOrderId` plus the `ProductQuantity[]` it gives back.
- **`planReopening(orders, needed)`** — Filters to physical orders, sorts latest-first (`b.number - a.number`), and subtracts `needed` units from shipped quantities. Returns `Reopening[]` or `undefined` if the order never shipped enough.
- **`shareOwed(reopenings, owed)`** — Walks the reopenings in order, capping each order's share at what it actually reopened, and returns a `Map<fulfillmentOrderId, ProductQuantity[]>` of owed units handed to the owed order.

## Relationships

- **`domain/fulfillment.ts`** — Source of the `FulfillmentLine` and `ProductQuantity` types used throughout this module.
- **`domain/index.ts`** — Barrel file; re-exports this module's types and functions for consumers.
- **`services/reship.ts`** — Service-layer caller that orchestrates persistence and invokes `planReopening` / `shareOwed`.
- **`tests/unit/reship.test.ts`** — Unit tests exercising the pure functions against various order/quantity combinations.
- **`tests/unit/fulfillment.test.ts`** — Tests the sibling `fulfillment.ts` module whose line-shape (`shippedQuantity`, `productId`) this file reads.

## Notes

- `planReopening` signals "not enough shipped" via `undefined`, **not** an empty array — callers must check for it.
- `physical: false` orders are silently filtered; digital orders never participate in a reship.
- Uses `Array.toSorted` (ES 2023 / non-mutating); the input `orders` array is never reordered.
- The doc comment states that line mutations go through `withLoss` (same rule as a lost parcel) — the functions here only *plan*, they do not mutate lines.
- "Latest shipped is reopened first" is the only ordering guarantee; among orders with the same `number` the original array order is preserved (stable sort).
