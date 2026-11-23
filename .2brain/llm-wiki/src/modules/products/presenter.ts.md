---
source: src/modules/products/presenter.ts
source_sha256: 255d213c133e4b6741484ca1244cc0043f629f24b5c7bda5595a6ed9e19feb4d
context_sha256: 9b364b1d9a6c9b08a98d38c6c079eab99f04d8b6f9f662ce3d42e3c8d1f1d566
generated_at: 2026-11-22T07:11:20.458599+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/presenter.ts

## Purpose
Single place where a product document becomes the `Product` contract. Every read path that builds from a document (including `getById` in the products read service) uses it instead of a hand-written `.toJSON() as Product` cast. The product carries no stock: availability is `inventory`'s own read, so the only derived fields are the live `currency` and `actions`.

## Key elements
- `presentProduct(document: ProductDocument): Product` is the only export. It maps the document onto the contract:
  - `id` comes from the Mongoose `id` getter.
  - `title` is always set.
  - `price` is `padDecimal(document.price, shopCurrency())`. The stored Decimal128 loses its trailing zeros, so the shop's live currency restores the decimal places.
  - `currency` is read live from `shopCurrency()` (never stored).
  - `actions` is always `NO_PRODUCT_ACTIONS` (all `false`).
  - Optional fields (`taxClass`, `rateType`, `sku`, `description`, `active`, `purchasable`, `allowBackorder`, `requiresShipping`, `noWithdrawal`, `weight`, `imageUrl`, `thumbnailUrl`, `categories`, `tags`) are copied only when present.
  - `releaseDate` and `restockDate` are converted with `shopDayOf` to the shop's day.
  - `createdAt`, `updatedAt` and `deletedAt` become ISO strings when present.
- The result is wrapped in `carryVersion(document, ...)`, so the row's version rides beside the result for the `ETag` without being part of the contract.

## Relationships
- `@types` (`src/types/index.ts`): supplies the `Product` return type.
- `src/modules/products/model.ts`: supplies the `ProductDocument` input type.
- `src/modules/products/domain/actions.ts`: supplies `NO_PRODUCT_ACTIONS`. Per the code comment, the real actions are stamped elsewhere, since there is no caller for them yet.
- `src/infrastructure/persistence/versioning.ts`: supplies `carryVersion`.
- `src/modules/shop/index.ts`: supplies `shopCurrency` and `shopDayOf`. The `src/modules/shop/service.ts` neighbor is not imported directly here.
- `src/domain-primitives/money.ts`: supplies `padDecimal`.
- `src/modules/products/services/read.ts`: a consumer. `getById` builds its result through `presentProduct`.

## Notes
- Currency comes from `NODE_DEFAULT_CURRENCY` at call time, so the output can change if the shop currency changes. It is not persisted.
- `description`, `createdAt`, `updatedAt` and `deletedAt` are included only when truthy. The other optionals are included only when not `undefined`, so falsy values like `false` or `0` are kept.
- The returned `actions` are placeholders and must not be read as real permissions.
