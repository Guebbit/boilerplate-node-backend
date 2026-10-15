---
source: src/modules/products/presenter.ts
sha256: a3265d4e77dc8834bf79e2750159cb41a6b4196909bbec862a21c02669840bd0
generated_at: 2026-10-15T11:43:10.394560+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/presenter.ts

## Purpose

Single mapping point that converts a Mongoose `ProductDocument` into the public `Product` contract. All read paths (including `services/read.ts`'s `getById`) route through here so that derived stock/availability fields are computed once and agree everywhere, rather than each caller hand-casting `.toJSON() as Product`.

## Key elements

- **`derivedStockFields(facts)`** — Computes the non-stored block of a product response: `available`, `inStock`/`lowStock` flags, `preorder`, and live `currency`. Accepts the two stock counters plus `PreorderFacts`. Used both by `presentProduct` and by search's lean rows that never hold a full document.
- **`presentProduct(document)`** — Maps a full `ProductDocument` onto the `Product` contract. Spreads in `derivedStockFields`, ISO-stringifies the three date fields, conditionally includes optional fields (see Notes), and wraps the result with `carryVersion` so the row's version rides beside the contract for `ETag` generation.

## Relationships

- **`@types` (`src/types/index.ts`)** — Source of the `Product` contract type that both exports target.
- **`@infrastructure/persistence/versioning` (`src/infrastructure/persistence/versioning.ts`)** — Provides `carryVersion`, used by `presentProduct` to attach the row version for `ETag`.
- **`./domain/stock`** — Provides `availableStock` and `stockFlags`, the pure functions behind the derived availability block.
- **`./domain/preorder`** — Provides `isPreorder` and the `PreorderFacts` type used as input to `derivedStockFields`.
- **`./config`** — Provides `lowStockThreshold` and `productCurrency` (reads `NODE_DEFAULT_CURRENCY` at call time).
- **`./model`** — Source of the `ProductDocument` input type.
- **`src/modules/products/services/read.ts`** — Primary consumer; its `getById` calls `presentProduct` (per module doc comment).

## Notes

- **Optional-field omission pattern:** Every optional field (`taxClass`, `sku`, `description`, etc.) is spread behind an `=== undefined` guard, so absent fields are *omitted* from the response rather than emitted as `null`/`undefined`.
- **Preorder overrides `lowStock`:** When `preorder` is `true`, the spread explicitly sets `lowStock: false` after `stockFlags` has already computed it — a preorder is waiting for stock that doesn't exist yet, so "running low" is semantically wrong.
- **`currency` is not persisted:** It is read live from `productCurrency()` (env-driven) at presentation time; the document does not store it.
- **Version is outside the contract:** `carryVersion` wraps the result so the version is available to middleware for `ETag` without polluting the `Product` type.
