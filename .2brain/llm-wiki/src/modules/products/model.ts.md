---
source: src/modules/products/model.ts
sha256: 51fe46d61114ae1770f6c43bdb9811a5ce8e15a67819997acf25794a0dcc5054
generated_at: 2026-11-08T07:44:55.340395+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/model.ts

## Purpose

Defines the product data model end-to-end: the Mongoose schema, the TypeScript interfaces that describe stored vs. derived vs. snapshot shapes, and the Zod validation schemas (create / replace / update) that layer business refinements on top of the generated API contract. It is the single source of truth for what a product document looks like in the database and how inbound bodies are validated before a write.

## Key elements

- **`ProductRecord`** – Plain-object shape of the stored fields (dates as `Date`, `_id` as `ObjectId`). Excludes derived fields (`available`, `inStock`, `lowStock`, `preorder`, `backorder`) and currency. Acceptable for lean reads and test fixtures.
- **`ProductSnapshot`** – `ProductRecord` minus stock counters, backorder fields, and active/purchasable flags. Represents what an order line remembers; consumed by `orders/model.ts`.
- **`ProductDocument`** – `ProductRecord` ∩ Mongoose `Document`. Adds `id` string getter and `pendingImageKey` (document-only, never serialized to snapshots).
- **`ProductModel`** – Typed `Model<ProductDocument>` for repository and service use.
- **`checkProductTranslationFields`** – Validates one locale's title/description against the contract's `translations` schema; returns `TranslationFieldIssue[]`.
- **`refineProduct`** (internal) – Aggregates four business refinements: fallback-locale guard, release/restock date ≤ 1 year ahead, and price decimal-place check.
- **`zodProductCreateSchema` / `zodProductReplaceSchema` / `zodProductUpdateSchema`** – `superRefine`-wrapped versions of the generated `CreateProductBody`, `ReplaceProductByIdBody`, `UpdateProductByIdBody` respectively.
- **`productSchema`** – Mongoose `Schema` with `moneyPlugin`, `revisionPlugin`, `applySerialization`, and the field definitions (title, price, taxClass, rates, translations, stock counters, image digest fields).

## Relationships

- **`@domain-primitives/money`** – Imports `fitsCurrency` and `minorUnitExponent` to validate price decimal places against the shop currency.
- **`@infrastructure/i18n`** – Imports `getFallbackLocale` (to guard the fallback locale) and `t` (for i18n error messages).
- **`@infrastructure/persistence/money-field`** – Imports `moneyPath` and `moneyPlugin` to declare the `price` field in the Mongoose schema.
- **`@infrastructure/persistence/revision-plugin`** – Imports `revisionPlugin` to attach revision tracking to the schema.
- **`@infrastructure/persistence/serialize`** – Imports `applySerialization` to register the derived-field transform (e.g. `available`).
- **`@kernel/registry`** – Imports the `TranslationFieldIssue` type returned by `checkProductTranslationFields`.
- **`@modules/orders/model.ts`** – Embeds a Mongoose sub-schema that mirrors `ProductSnapshot`; its `OrderDocumentItem.product` is typed by this file's `ProductSnapshot`, not `ProductRecord`.
- **`@modules/cart/services/*`** (preorder, shelf, view) and **`@modules/orders/services/*`** (place, snapshot) – Downstream consumers that import `ProductRecord` or `ProductSnapshot` for reads and snapshots.
- **`@modules/orders/tests/factories.ts`** – Produces `ProductRecord`-shaped fixtures for order tests.

## Notes

- `available`, `inStock`, `lowStock`, `preorder`, and `backorder` are **never persisted**; they are computed at serialization time so no writer can let them drift.
- `onHand` and `reserved` are declared in this schema but are **written exclusively by the inventory module**; this module only declares the fields.
- `pendingImageKey` lives on `ProductDocument` only, intentionally excluded from `ProductSnapshot` so it never appears in embedded order-line copies.
- The `CHECKED_LOCALE = 'checked'` sentinel parks a single locale's fields under a synthetic key so the contract's own `translations` map can parse them; the key name never appears in user-facing messages.
- `mustBePresent` is `true` for create and PUT (whole-set semantics) but `false` for PATCH (omission = leave unchanged), yet a `null` fallback locale is always rejected.
- Past `releaseDate`/`restockDate` values are valid; only dates more than one year in the future (relative to `latestReleaseDate`) are rejected.
- Absent `taxClass` means the shop's standard rate; absent `rateType` means `zero` — both rely on the service layer resolving the default, not on a stored value.
