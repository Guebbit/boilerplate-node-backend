---
source: src/modules/inventory/services/types.ts
source_sha256: d7edfd3eb092eeb55935e61e95e088299249631e111969210c06ba563f887e74
context_sha256: f43fa1c241df93d5a618d9f4c0270dc86e61bcb83a794471b9169c4e26374836
generated_at: 2026-11-22T05:24:29.520362+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/types.ts

## Purpose
Type-only module defining the input and output shapes of the inventory stock operations (reserve, give back, top-up, stock reads). It holds no runtime logic, only interfaces and a union type shared by the services that act on stock.

## Key elements
- `StockLine`: a line being held or given back. It has `productId` (string; the repository converts), `quantity`, optional `kind` (`HoldKind`: `stock` by default, or `backorder`) and optional `spill`. `spill` is read only by a reserve: it takes the shelf units available and claims the rest against the backorder cap, for a released product open to backorder. The catalogue decides this, never the inventory module.
- `StockShortfall`: a line a hold could not cover, with `productId`, `title`, `requested` and `available`. For a preorder line, `available` is the remaining allowance, not shelf stock.
- `ReserveOutcome`: a discriminated union on `held`.
  - `held: true` carries `expiresAt` and `owed`, a per-product list of units owed rather than on the shelf (empty if none).
  - `held: false` carries `shortfalls`.
- `TopUp`: the result of topping up a hold for one product after a lost parcel. `shelf` is units reserved from the free shelf, and `owed` is units claimed as a backorder.
- `StockPosition`: what can be sold of a product now. `available` is everything a line may ask for, and `shelf` is only the units on the shelf.
- `LevelFilters`: stock-board read filters. It extends `PaginationInput` and adds `lowOnly`.
- `MovementFilters`: ledger read filters, `productId` and `reason` (`StockMovementReason`).

## Relationships
- Imports `StockMovementReason` from `@types` (`src/types/index.ts`), `HoldKind` from `../domain` (`src/modules/inventory/domain/index.ts`), and `PaginationInput` from `@infrastructure/persistence/search` (`src/infrastructure/persistence/search.ts`).
- The neighbouring services (`allocate`, `holds`, `levels`, `reserve`, `top-up`) sit in the same folder and fit these shapes by name (reserve, top-up, levels). The cart and orders services (`src/modules/cart/services/view.ts`, `src/modules/orders/services/place.ts`, `src/modules/orders/services/fulfillment.ts`) are also graph neighbours. The file content does not show how any of them use these types.

## Notes
- `ReserveOutcome.expiresAt` is documented as the same value the reservation was written with. Callers should not compute their own deadline from `holdMinutes`.
- A reserve returns a result rather than a boolean so a refusal can name the short line and the count left, read at the moment of refusal.
- A hold can carry the same product under both `stock` and `backorder` kinds once part of a preorder is allocated. Callers giving back or shipping a line must name which `kind`.
