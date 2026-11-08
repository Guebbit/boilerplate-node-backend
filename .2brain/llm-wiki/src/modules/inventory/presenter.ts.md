---
source: src/modules/inventory/presenter.ts
sha256: 34055c8045857b1e8f2e8b36c5364d94671769545b08dd20f9d8744124dc0094
generated_at: 2026-11-08T06:00:50.385251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/presenter.ts

## Purpose

Presentation layer for the inventory module: it takes internal stock counters (owned by this module) and, together with product facts supplied by callers, produces the exact wire shapes that `openapi.yaml` declares. It never imports or queries another module itself — services fetch the cross-module data and pass it in as plain arguments.

## Key elements

- **`PreorderProductFacts`** (exported interface) — the subset of product info the `products` module must supply for a preorder-board row: optional `title`, optional `releaseDate`, and a `sellsAgainstCap` boolean.
- **`presentInventoryLevel`** (exported function) — maps a `StockLevelRow` (minus its id) plus a title string into a full `InventoryLevel` wire object. Stringifies `productId` (which may still be a Mongoose `ObjectId`), spreads in the cap, and passes through `onHand`/`reserved`/`available`/`backordered`.
- **`capOf`** (private helper) — translates the stored cap encoding to the wire encoding: `null` → key omitted (no cap); a number (including `0`) → key present. Ensures a response never carries `null`.
- **`presentPreorderLevel`** (exported function) — maps a `PreorderLevelRow` plus `PreorderProductFacts` into a `PreorderLevel` wire object. Falls back to `productId` when `title` is absent, includes `releaseDate` (formatted via `shopDayOf`) only when present, and includes `left` (remaining room under cap) only when the product actively sells against a cap.

## Relationships

- **`src/modules/inventory/repository.ts`** — source of the `StockLevelRow` and `PreorderLevelRow` types that the presenters consume as input shapes.
- **`src/types/index.ts`** — source of the `InventoryLevel` and `PreorderLevel` types that the presenters return (the target wire shapes).
- **`src/modules/shop/index.ts`** — provides `shopDayOf`, used to format `releaseDate` into the wire representation.
- **`src/modules/inventory/services/admin.ts`** / **`src/modules/inventory/services/levels.ts`** — call-site services that gather cross-module facts (title, release date, cap eligibility) and invoke the presenters here.
- **`src/modules/inventory/tests/unit/presenter.test.ts`** — unit tests exercising both public presenters.

## Notes

- **Cap encoding is intentionally inverted between disk and wire.** On disk: `null` = no cap, field absent = 0 (closed). On the wire: key absent = no cap, value `0` = closed. `capOf` is the single translation point; never compare against `null` in a handler.
- **`productId` type shift.** Repository rows carry a Mongoose `Types.ObjectId`; `presentInventoryLevel` coerces it with `String()`. Callers that pass a pre-stringified id still work, but the function signature accepts both.
- **`left` is conditional.** It appears in the response only when `sellsAgainstCap` is `true` **and** `backorderLimit` is not `null`. Downstream consumers must treat a missing `left` key as "cap does not apply," not as zero.
- **No cross-module imports.** By design this file does not import from `products` or any other domain module. If you find a need to reach in, refactor the service layer to pass the value in instead.
