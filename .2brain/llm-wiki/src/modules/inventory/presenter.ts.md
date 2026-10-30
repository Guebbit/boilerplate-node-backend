---
source: src/modules/inventory/presenter.ts
sha256: 3385bc81b2edfa385bcdec3fd12c0da8c767dae1daa5bf287406a7207ad7320a
generated_at: 2026-10-29T04:02:03.573397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/presenter.ts

## Purpose

Pure mapping layer that converts raw stock counters (read from the repository) into the wire shapes declared in `openapi.yaml`. Product facts (title, release date, cap eligibility) are injected as parameters by the services layer, so this module performs no I/O and never reaches into another module.

## Key elements

- **`PreorderProductFacts`** (interface) — the subset of product data the services pass in for the preorder board: optional `title`, optional `releaseDate`, and a boolean `sellsAgainstCap`.
- **`presentInventoryLevel`** (exported fn) — maps a `StockLevelRow` (with a possibly-ObjectId `productId`) plus a `title` into an `InventoryLevel` wire object. Normalises `productId` to `String` and applies `capOf`.
- **`capOf`** (private helper) — inverts the on-disk ↔ on-wire semantics of `backorderLimit`: disk `null` → wire absent (no cap); disk absent/`0` → wire `0` (closed). Guarantees the response never contains `null`.
- **`presentPreorderLevel`** (exported fn) — maps a `PreorderLevelRow` plus `PreorderProductFacts` into a `PreorderLevel` wire object. Falls back to `row.productId` when `title` is absent, serialises `releaseDate` to ISO-8601 only if present, and computes `left` (cap minus backordered, floored at 0) only when `sellsAgainstCap` is true **and** a cap exists.

## Relationships

- **`./repository`** — source of the `StockLevelRow` and `PreorderLevelRow` types this file transforms.
- **`@types`** (`src/types/index.ts`) — target of the `InventoryLevel` and `PreorderLevel` wire types this file produces.
- **`services/admin.ts`** / **`services/levels.ts`** — callers that gather counters + product facts and invoke the presenters before returning API responses.
- **`tests/unit/presenter.test.ts`** — unit tests exercising the mapping logic, including the `capOf` inversion and the `left` computation.

## Notes

- The cap semantics are intentionally inverted between storage and the wire (see `capOf` docstring). Any new field with the same null-vs-absent pattern should follow the same convention.
- `presentPreorderLevel` omits `left` entirely when there is no cap or the product doesn't sell against one — consumers must treat a missing key as "not applicable," not zero.
- `productId` in the input may be a Mongoose `Types.ObjectId`; the presenter coerces it with `String()` so callers need not.
