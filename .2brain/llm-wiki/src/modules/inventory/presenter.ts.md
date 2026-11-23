---
source: src/modules/inventory/presenter.ts
source_sha256: 34055c8045857b1e8f2e8b36c5364d94671769545b08dd20f9d8744124dc0094
context_sha256: 72c329be5ab162afe81f9b17397533a02a25f06d6bd0fb1c1183192d65275168
generated_at: 2026-11-22T05:20:27.746090+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/presenter.ts

## Purpose
Converts inventory stock counters into the wire shapes declared in `openapi.yaml` (`InventoryLevel`, `PreorderLevel`). The counters belong to the inventory module; the title and release date belong to `products`, so the services read them and pass them in as plain facts. The presenter never reaches into another module.

## Key elements
- `PreorderProductFacts` — interface for what `products` says about one preorder row: optional `title`, optional `releaseDate`, and `sellsAgainstCap` (true when the product is a preorder now or open to backorder, so its cap is meaningful).
- `presentInventoryLevel(level, title)` — returns an `InventoryLevel` with `productId` (stringified, since it may still be an ObjectId), `title`, `onHand`, `reserved`, `available`, `backordered`, and `backorderLimit` when a cap exists.
- `presentPreorderLevel(row, facts)` — returns a `PreorderLevel` for one row of the preorder board:
  - spreads the row's counters
  - falls back to `row.productId` when `title` is missing
  - adds `releaseDate` as a shop day via `shopDayOf`, only when a date is given
  - adds `left = max(0, backorderLimit - backordered)` only when `sellsAgainstCap` is true and the cap is not `null`
- `capOf` (private) — maps the stored cap to its wire form.

## Relationships
- `src/modules/inventory/repository.ts` — supplies the `StockLevelRow` and `PreorderLevelRow` types that the presenters accept.
- `src/modules/inventory/services/admin.ts` and `src/modules/inventory/services/levels.ts` — the services that read titles and release dates from `products` and call the presenters. This is inferred from the module doc, not visible in this file.
- `src/modules/shop/index.ts` and `src/modules/shop/service.ts` — `shopDayOf` is imported from `@modules/shop` (the shop module's public entry point) to turn a release `Date` into the shop-day format.
- `src/types/index.ts` — provides the `InventoryLevel` and `PreorderLevel` output types, imported via `@types`.
- `src/modules/inventory/tests/unit/presenter.test.ts` — unit tests for this file.

## Notes
- The cap meaning is deliberately inverted between storage and wire. On disk, `null` means no cap and an absent field means 0 (closed). On the wire, an absent `backorderLimit` key means no cap and `0` means closed. A response never carries `null`.
- `left` is omitted when there is no cap, or when the product does not sell against its cap.
- `presentPreorderLevel` destructures `backorderLimit` out of the row before spreading, so the stored value only reaches the output through `capOf`.
