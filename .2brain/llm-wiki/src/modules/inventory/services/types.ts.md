---
source: src/modules/inventory/services/types.ts
sha256: d7edfd3eb092eeb55935e61e95e088299249631e111969210c06ba563f887e74
generated_at: 2026-10-29T04:05:32.415815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/types.ts

## Purpose

Defines the request/response shapes (interfaces and type aliases) shared across the inventory stock-operation services. It exists as a single module so that allocate, holds, levels, reserve, and top-up services — plus external consumers in cart and orders — agree on the exact data contracts without importing implementation details from one another.

## Key elements

- **`StockLine`** — A product line for hold/release/ship operations. Carries `productId` (string; the repository coerces to its native id), `quantity`, an optional `kind` (`HoldKind` from the domain) distinguishing shelf stock from backorder allowance, and an optional `spill` flag consumed only by the reserve service to allow overflow into the backorder cap.
- **`StockShortfall`** — One line a hold could not fully cover; records `requested` vs `available` so a refusal can name the gap.
- **`ReserveOutcome`** — Discriminated union (`held: true | false`) that is the return type of a reserve call. On success it returns `expiresAt` (the hold's own deadline, not a recomputed one) and `owed` (units claimed against the cap rather than shelf). On failure it returns an array of `StockShortfall`.
- **`TopUp`** — Per-product breakdown of a post-loss top-up: `shelf` units taken from free stock and `owed` units claimed against the restock outside the backorder cap.
- **`StockPosition`** — What is sellable right now for a product: `available` (shelf + room under cap, as the product's catalogue entry permits) and `shelf` (shelf units only, so callers can tell whether a line spills).
- **`LevelFilters`** — Extends `PaginationInput` with `lowOnly` for the stock-board listing endpoint.
- **`MovementFilters`** — Filters for the stock-movement ledger read: optional `productId` and `reason` (`StockMovementReason`).

## Relationships

- **Imports `HoldKind`** from `src/modules/inventory/domain/index.ts` — the `kind` field on `StockLine` and the domain's hold taxonomy.
- **Imports `StockMovementReason`** from `src/types/index.ts` — used by `MovementFilters.reason`.
- **Imports `PaginationInput`** from `src/infrastructure/persistence/search.ts` — `LevelFilters` extends it for shared `page`/`pageSize` semantics.
- **Consumed by all inventory service siblings** (`allocate.ts`, `holds.ts`, `levels.ts`, `reserve.ts`, `top-up.ts`, `index.ts`) as their shared type vocabulary.
- **Consumed by `src/modules/cart/services/view.ts`** and **`src/modules/orders/services/{place,fulfillment}.ts`** so upstream modules can type their inventory calls without reaching into service internals.

## Notes

- All ids are typed as `string` at this layer; the persistence repository is responsible for coercion to its native type.
- `spill` on `StockLine` is read **only** by the reserve service. The decision to allow backorder overflow is made by the catalogue, not by this module.
- `ReserveOutcome.held === true → expiresAt` is the same timestamp written into the hold record. Callers must not recompute a deadline from `holdMinutes`; there is one real deadline.
- In `StockShortfall`, `available` for a backorder/preorder line means "what remains of the allowance," not "what is physically on the shelf."
- This file is type-only (no runtime exports); it can be safely imported with `import type` in every consumer.
