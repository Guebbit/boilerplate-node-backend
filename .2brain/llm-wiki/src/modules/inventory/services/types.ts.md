---
source: src/modules/inventory/services/types.ts
sha256: dd4458fc4637a9f030c7134c98e9a09336c97a7531845d15f85882bcc00db339
generated_at: 2026-10-14T16:00:19.379984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/types.ts

## Purpose

Defines the input/output shapes shared by the inventory stock-operation services (reserve, hold, allocate, levels). Centralizing these interfaces keeps the service layer and its callers (orders, UI) in agreement without each file redefining its own structs.

## Key elements

- **`StockLine`** — A single product/quantity pair for a hold or release. `kind` (`HoldKind`) disambiguates shelf stock vs. preorder allowance when the same product is carried under both.
- **`StockShortfall`** — One line a reservation could not fully cover; reports `requested` vs. `available` (for preorder lines, `available` is the remaining allowance, not shelf count).
- **`ReserveOutcome`** — Discriminated union returned by the reserve operation: either `{ held: true, expiresAt: Date }` or `{ held: false, shortfalls: StockShortfall[] }`. `expiresAt` is the authoritative deadline written to the hold; callers must not recompute it.
- **`LevelFilters`** — Query params for a stock-board read; extends `PaginationInput` with an optional `lowOnly` flag.
- **`MovementFilters`** — Query params for a ledger/history read; optional `productId` and `reason` (`StockMovementReason`) on top of shared pagination.

## Relationships

- **Imports** `HoldKind` from `../domain/index` and `StockMovementReason` from `@types` (→ `src/types/index.ts`); imports `PaginationInput` from `@infrastructure/persistence/search` (→ `src/infrastructure/persistence/search.ts`).
- **Consumed by** the sibling services `reserve.ts`, `holds.ts`, `allocate.ts`, and `levels.ts`, all re-exported through `services/index.ts`.
- **Consumed by** `src/modules/orders/services/place.ts`, which passes `StockLine[]` and reads `ReserveOutcome` when placing an order.

## Notes

- `StockLine.kind` is optional and defaults to shelf stock (`stock`); it is only meaningful when a product exists under both a shelf hold and a preorder allowance simultaneously.
- `ReserveOutcome.expiresAt` is the single source of truth for the hold deadline. Callers must not derive a second expiry from `holdMinutes` themselves.
- `LevelFilters` and `MovementFilters` intentionally do **not** share a common parent beyond the pagination fields they each pull in; do not assume a union type exists between them.
