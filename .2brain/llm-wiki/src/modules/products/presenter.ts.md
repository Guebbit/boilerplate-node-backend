---
source: src/modules/products/presenter.ts
sha256: dc1f53db1f6a8ad91ff48ffa6ea6c5f571f1278c5946a7f8af6e0477f2bc1c91
generated_at: 2026-11-14T21:25:27.894073+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/presenter.ts

## Purpose

Single mapping point that turns a `ProductDocument` (Mongoose model) into the `Product` wire contract. Every read path—including `services/read.ts`'s `getById`—routes through this module instead of hand-rolling a `.toJSON() as Product` cast, so the document's own serialisation and a presented document always agree on derived fields.

## Key elements

- **`derivedStockFields(facts: BuyableFacts)`** — Computes the block of a `Product` that is *derived, never stored*: `available` (shelf stock or remaining preorder allowance), `inStock`/`lowStock` flags, `preorder`, `backorder`, `buyable`, live `currency`, and `actions` (always `NO_PRODUCT_ACTIONS` for now). Preorders suppress `lowStock` since the goods don't exist yet.
- **`presentProduct(document: ProductDocument): Product`** — Maps a full document onto the `Product` shape. Pulls `id` from the Mongoose getter, spreads `derivedStockFields`, conditionally includes ~20 optional fields (tax, sku, dates, media, categories, etc.), pads the Decimal128 price via `padDecimal`, and wraps the result with `carryVersion` so the document version rides alongside for ETag use.

## Relationships

- **`src/modules/products/domain/stock.ts`** — `availableStock`, `preorderAllowanceLeft`, `stockFlags` supply the stock arithmetic inside `derivedStockFields`.
- **`src/modules/products/domain/preorder.ts` / `src/modules/products/domain/backorder.ts` / `src/modules/products/domain/buyable.ts`** — `isPreorder`, `isBackorder`, `isBuyable` (and the `BuyableFacts` type) determine the boolean product states.
- **`src/modules/products/domain/actions.ts`** — Provides `NO_PRODUCT_ACTIONS`, the placeholder until a real actions service stamps actual entries.
- **`src/modules/products/config.ts`** — `lowStockThreshold` feeds the `lowStock` flag calculation.
- **`src/modules/products/model.ts`** — Source of the `ProductDocument` type (Mongoose schema interface).
- **`src/modules/shop/index.ts`** — `shopCurrency` (live currency for `currency` field and price padding) and `shopDayOf` (normalises date fields to shop day).
- **`src/infrastructure/persistence/versioning.ts`** — `carryVersion` attaches the document version for ETag propagation without polluting the `Product` contract.
- **`src/domain-primitives/money.ts`** — `padDecimal` restores trailing zeros lost in Decimal128 storage.
- **`src/types/index.ts`** — Defines the `Product` contract this module produces.
- **`src/modules/products/services/read.ts`** — Primary consumer; calls `presentProduct` in `getById`.
- **`tests/integration/scenarios/shop.test.ts`** — Exercises the presenter through end-to-end shop flows.

## Notes

- `actions` is always `NO_PRODUCT_ACTIONS` (all-false) in this presenter. The real action values are stamped elsewhere (the doc comment references `services/actions.ts`), so consumers must not assume the presenter alone determines purchasability UI.
- Optional fields are spread with explicit `undefined` guards (`...(document.x === undefined ? {} : { x: … })`) to avoid emitting `null`/`undefined` keys on the wire.
- `releaseDate` and `restockDate` pass through `shopDayOf`, not `toISOString`, while `createdAt`/`updatedAt`/`deletedAt` use `toISOString`. The distinction is intentional—shop-day vs. full timestamp.
- Search paths that need lean rows call `derivedStockFields` directly with extracted counters rather than materialising a full document; they never invoke `presentProduct`.
