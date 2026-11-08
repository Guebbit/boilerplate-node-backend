---
source: src/modules/products/presenter.ts
sha256: 1ca6435feda861a1a50411f2e445d6f70344fb2cceacb44510a94b2bd524bc7b
generated_at: 2026-11-08T07:46:04.818490+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/presenter.ts

## Purpose

Single presentation layer that transforms a Mongoose `ProductDocument` into the `Product` wire contract. Every read path (including `services/read.ts`'s `getById`) funnels through this file so the document's own serialisation and the API response agree on every derived field.

## Key elements

- **`derivedStockFields(facts: BuyableFacts)`** — Computes the derived, never-stored block of a product: `available`, `inStock`, `lowStock`, `preorder`, `backorder`, `buyable`, and live `currency`. For preorders, `available` comes from the remaining allowance (not shelf stock) and `lowStock` is forced to `false`.
- **`presentProduct(document: ProductDocument): Product`** — Maps a full document onto the `Product` contract: formats `price` with `padDecimal`, spreads in `derivedStockFields`, conditionally includes optional fields (omits `undefined` keys), converts dates to ISO strings or day-precision via `shopDayOf`, and wraps the result with `carryVersion` so the document version travels alongside for ETag use.

## Relationships

- **`./domain/stock.ts`** — Provides `availableStock`, `preorderAllowanceLeft`, and `stockFlags` consumed by `derivedStockFields`.
- **`./domain/preorder.ts`** — Provides `isPreorder`; determines whether the allowance path or shelf path is used for `available`.
- **`./domain/backorder.ts`** — Provides `isBackorder` for the derived `backorder` flag.
- **`./domain/buyable.ts`** — Provides `isBuyable` and the `BuyableFacts` input type shared by all three domain predicates.
- **`./config.ts`** — Provides `lowStockThreshold()` used by `stockFlags`.
- **`./model.ts`** — Provides the `ProductDocument` type (Mongoose model shape).
- **`@modules/shop/index.ts`** — Provides `shopCurrency()` (live currency for price padding and `currency` field) and `shopDayOf()` (day-precision date conversion for `releaseDate`/`restockDate`).
- **`@domain-primitives/money.ts`** — Provides `padDecimal` to restore Decimal128 trailing zeros lost in storage.
- **`@infrastructure/persistence/versioning.ts`** — Provides `carryVersion` to attach the document's version outside the `Product` object for ETag generation.
- **`@types/index.ts`** — Source of the `Product` contract type that both exports target.
- **`src/modules/products/services/read.ts`** — Consumer: its `getById` calls `presentProduct` rather than hand-casting a document.
- **`tests/integration/scenarios/shop.test.ts`** — Integration tests exercise the presentation output end-to-end through shop endpoints.

## Notes

- Preorders intentionally suppress `lowStock` (stock does not exist yet, so "running low" is meaningless). The allowance exhaustion *is* the sold-out signal.
- `padDecimal` uses the **live** shop currency to determine decimal places, not the currency stored on the document — this keeps the wire format correct if the shop's currency changes.
- Optional fields use the `...(cond ? { key: val } : {})` spread pattern; absent fields are omitted from the response entirely (no `null` / `undefined` keys).
- The document's version is **not** part of the `Product` contract; `carryVersion` tacks it on as a sibling property for the caller to build an ETag from.
- `releaseDate` and `restockDate` are passed through `shopDayOf` (day precision), while `createdAt`/`updatedAt`/`deletedAt` use full ISO timestamp strings.
