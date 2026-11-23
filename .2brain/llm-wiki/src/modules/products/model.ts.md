---
source: src/modules/products/model.ts
source_sha256: 4a023bf773860f2622460bf1587c7bf35bb3793acb189c893ea5a42d733f0c55
context_sha256: 381de5c7d20798628bb5bb78fb3736a375e6b32e694382b10aa99cf3f3d3f2bc
generated_at: 2026-11-22T07:10:20.567438+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/model.ts

## Purpose
Defines the product's Mongoose schema and TypeScript shapes, plus the Zod validation schemas for create, PUT and PATCH bodies. Per its header, the product holds no stock (availability is `inventory`'s own read), and a serialization transform stamps the derived `currency` and `actions` fields.

## Key elements
- `ProductRecord`: the stored fields. It is `Product` from `openapi.yaml` with the derived fields (`currency`, `actions`) omitted and the date fields typed as `Date`. It is kept separate from `ProductDocument` so plain objects such as lean reads and fixtures can satisfy it.
- `ProductSnapshot`: `ProductRecord` minus the live-shelf fields (`active`, `purchasable`, `allowBackorder`, `restockDate`). This is the shape an order line remembers.
- `ProductDocument`: `ProductRecord` plus Mongoose `Document`. It adds `id` and the document-only `pendingImageKey`, which is not on `ProductSnapshot`.
- `ProductModel`: the Mongoose model type. Business logic lives in `./services` and queries in `./repository`.
- `productTranslationFieldRules`: the rules for one locale's fields, taken from `UpdateProductByIdBody.shape.translations`. The `translatables` registry uses them as its `fieldRules`.
- `zodProductCreateSchema`, `zodProductReplaceSchema`, `zodProductUpdateSchema`: the generated `CreateProductBody`, `ReplaceProductByIdBody` and `UpdateProductByIdBody` with a shared `superRefine` (`refineProduct`) added.
- `productSchema`: the stored shape. Fields visible here:
  - `title` and `price` (via `moneyPath`).
  - `taxClass` and `rateType` (enums from the contract's `TaxClass` and `RateType`).
  - `sku`, `description`, `imageUrl`, `thumbnailUrl`, `pendingImageKey`, `categories`, and others beyond the visible portion.
- Internal refinements:
  - `refineFallbackLocale`: the fallback locale in `translations` must not be `null`, and must be present on create and PUT.
  - `refineDateWithinYear`: `releaseDate` and `restockDate` may be at most one year ahead. Past dates are allowed.
  - `refinePricePlaces`: the price may have no more decimals than the shop currency's minor unit.

## Relationships
- `src/domain-primitives/money.ts`: `fitsCurrency` and `minorUnitExponent` back the price-places refinement.
- `src/infrastructure/i18n` (`index.ts`, which re-exports the catalog and context): `t` and `getFallbackLocale` produce the localized refinement messages and supply the fallback locale.
- `src/infrastructure/persistence/money-field.ts`: `moneyPath` and `moneyPlugin` are imported for the `price` field.
- `src/infrastructure/persistence/revision-plugin.ts` and `serialize.ts`: `revisionPlugin` and `applySerialization` are imported to wire revisions and the serialization transform.
- `src/modules/products/domain/actions.ts`: `NO_PRODUCT_ACTIONS` is imported for the derived `actions` field.
- `src/modules/orders/model.ts`: per the file's comments, embeds a Mongoose schema that mirrors `ProductSnapshot` rather than `productSchema` itself, and types its order-line product by `ProductSnapshot`.
- The cart services (`src/modules/cart/services/preorder.ts`, `shelf.ts`, `view.ts`), the orders services (`src/modules/orders/services/place.ts`, `snapshot.ts`) and `src/modules/orders/tests/factories.ts` are graph neighbors. The visible portion of this file does not show how they use it.

## Notes
- The derived fields `currency` and `actions` are computed at serialization and never persisted.
- A product with no description, image or thumbnail has no field at all, never an empty string. `imageUrl: null` on an update unsets it.
- `thumbnailUrl` is set together with `imageUrl` by `readUploadedImage`, never independently and never by a client.
- `pendingImageKey` is internal bookkeeping for the image digest pipeline. It is never part of the `Product` contract and is not carried into order snapshots.
- `sku` uniqueness is enforced by the `products_sku` index (`unique`, `sparse`), not by the field declaration.
- An absent `taxClass` means the shop's standard rate. An absent `rateType` means `standard`.
- Date-too-far checks resolve the day to the shop's midnight via `startOfShopDay`. They skip values that already failed the field's `format: date` check.
