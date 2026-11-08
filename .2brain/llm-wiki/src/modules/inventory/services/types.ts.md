---
source: src/modules/inventory/services/types.ts
sha256: d7edfd3eb092eeb55935e61e95e088299249631e111969210c06ba563f887e74
generated_at: 2026-11-08T06:04:22.743245+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/types.ts

## Purpose

Defines the input and output type shapes for all inventory stock operations (reserve, hold, top-up, level reads, movement reads). It exists so the service layer and its external consumers share a single vocabulary for "what a stock operation takes and what it answers back."

## Key elements

- **`StockLine`** — A product line being held, released, or shipped. Carries `kind` (`stock` | `backorder`) and an optional `spill` flag that only the reserve operation reads.
- **`StockShortfall`** — One line a hold could not cover: `requested` vs `available` (allowance remainder for preorders, not shelf count).
- **`ReserveOutcome`** — Discriminated union: `{ held: true, expiresAt, owed }` or `{ held: false, shortfalls }`. Replaces a bare boolean so a refusal names the exact shortfalls at the moment of refusal.
- **`TopUp`** — Per-product breakdown of how a hold was topped up after parcel loss: `shelf` (from free units) + `owed` (claimed against restock, outside the backorder cap).
- **`StockPosition`** — Sellable quantity of one product: `available` (total a line may claim) vs `shelf` (on-shelf units only).
- **`LevelFilters`** — Extends `PaginationInput` with optional `lowOnly` for stock-board reads.
- **`MovementFilters`** — Optional `productId` / `reason` filters for ledger reads.

## Relationships

- **Imports from** `src/types/index.ts` — `StockMovementReason` (used in `MovementFilters`).
- **Imports from** `src/modules/inventory/domain/index.ts` — `HoldKind` (discriminates shelf vs. backorder lines).
- **Imports from** `src/infrastructure/persistence/search.ts` — `PaginationInput` (base for `LevelFilters`).
- **Consumed by** every inventory service implementation (`reserve.ts`, `holds.ts`, `top-up.ts`, `levels.ts`, `allocate.ts`) and re-exported through `services/index.ts`.
- **Consumed by** external modules: `src/modules/cart/services/view.ts`, `src/modules/orders/services/place.ts`, `src/modules/orders/services/fulfillment.ts` — all read `ReserveOutcome`, `StockLine`, or `StockPosition` as their contract with the inventory layer.
- **Domain context**: `src/modules/inventory/domain/transitions.ts` defines the state transitions these types parameterize.

## Notes

- All IDs are **strings** in these types; the repository layer performs the numeric conversion. Callers never pass `number` IDs here.
- `spill` on `StockLine` is intentionally opaque to hold/release operations — only `reserve.ts` interprets it. The catalogue (product configuration) decides whether a product is open to backorder, not this module.
- `ReserveOutcome.held.expiresAt` is the **single authoritative deadline**. Callers must not re-derive an expiry from `holdMinutes`; the reservation record is the source of truth.
- `StockPosition.available` ≥ `StockPosition.shelf` always holds; the gap is the backorder-cap room. A line that "spills" draws from that gap.
