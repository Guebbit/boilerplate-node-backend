---
source: src/modules/products/presenter.ts
sha256: 8fdf003420210c3fabdf53ec501ea9aa28997b881bc936fead5b92eec718719d
generated_at: 2026-10-29T05:27:32.677868+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/presenter.ts

## Purpose

Singular mapping layer that turns a `ProductDocument` (Mongoose) into the public `Product` contract. Every read path that serialises a full document — including `services/read.ts`'s `getById` — funnels through this file so that derived fields (`available`, `inStock`, `lowStock`, `preorder`, `backorder`, `buyable`, `currency`) are computed once and agree everywhere. Search lean-rows skip the full presentation and call `derivedStockFields` directly.

## Key elements

- **`derivedStockFields(facts: BuyableFacts)`** — Returns the block of derived, never-stored `Product` fields. Computes `available` (shelf stock for normal products; remaining preorder allowance for preorders), `inStock`/`lowStock` flags via `stockFlags`, and sets `preorder`, `backorder`, `buyable`, and a live `currency`. Explicitly forces `lowStock: false` when the product is a preorder.
- **`presentProduct(document: ProductDocument): Product`** — Maps a full Mongoose document onto the `Product` shape. Spreads `derivedStockFields(document)`, conditionally includes every optional field (omitted when `undefined`), ISO-stringifies all date fields, and wraps the result with `carryVersion` so the row version rides alongside for ETag generation.

## Relationships

- **`./domain/stock`** — Supplies `availableStock`, `preorderAllowanceLeft`, and `stockFlags`, the core arithmetic behind every derived stock value.
- **`./domain/preorder`** — `isPreorder` determines whether the product is in a preorder window, which switches the `available` calculation and suppresses `lowStock`.
- **`./domain/backorder`** — `isBackorder` sets the `backorder` flag in the output.
- **`./domain/buyable`** — `isBuyable` sets the `buyable` flag; its `BuyableFacts` type is the input contract for `derivedStockFields`.
- **`./config`** — `lowStockThreshold()` provides the configurable threshold passed into `stockFlags`.
- **`./model`** — Defines the `ProductDocument` type that `presentProduct` accepts.
- **`@modules/shop`** — `shopCurrency()` is called live to embed the current currency in every presented product.
- **`@infrastructure/persistence/versioning`** — `carryVersion` attaches the document's version to the result object (not part of the `Product` contract) for ETag use.
- **`@types`** — The `Product` interface this file conforms to.
- **`services/read.ts`** — Primary consumer of `presentProduct` for the `getById` path.
- **`tests/integration/scenarios/shop.test.ts`** — Integration tests that exercise the full presentation pipeline end-to-end.

## Notes

- **Preorder overrides**: When `isPreorder` is true, `available` is computed from the preorder allowance (`backorderLimit` − `backordered`), *not* from `onHand`/`reserved`. Additionally `lowStock` is hard-set to `false` regardless of the flag calculation, because a preorder waits for stock that doesn't exist yet.
- **Conditional spread pattern**: Every optional field uses `...(x === undefined ? {} : { x })` to keep `undefined` keys out of the JSON payload. Don't add a field without this guard or you'll leak `undefined` keys.
- **`carryVersion` is not part of `Product`**: The returned object is structurally `Product & { _version: … }`. Downstream code that type-casts to `Product` will silently ignore the version; only the ETag middleware reads it.
- **`derivedStockFields` is the public hook for search**: Search index rows never hold a full document, so they call this function with hand-assembled `BuyableFacts` rather than going through `presentProduct`.
