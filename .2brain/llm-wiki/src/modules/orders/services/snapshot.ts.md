---
source: src/modules/orders/services/snapshot.ts
source_sha256: 078ca4e6d4bf5eccf3f1c4016c82813f296a325c9c346e22fb06397612f2007a
context_sha256: 3f5fa2330c8d320c49793357adc58e92345f70585becfcc197764260993c9bcf
generated_at: 2026-11-22T06:23:56.256987+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/snapshot.ts

## Purpose
Turns catalogue products into the frozen order line snapshots stored on an order. It lives in `services/` rather than `../domain` because it deliberately depends on infrastructure (`@infrastructure/i18n`) and `@kernel/translation`, which the domain tier must not touch.

## Key elements
- **`resolveSnapshotProducts(locale, products)`**: Generic over `{ _id: Types.ObjectId }`. Binds `locale` with `runWithLocale`, calls `resolveTranslations('product', ids, localeCandidatesFor(locale))`, and overlays the resolved fields (`title`/`description`) onto each product. Products with no translation row come back unchanged.
- **`freezeOrderLines(locale, products, quantities)`**: Calls `resolveSnapshotProducts`, then builds one `OrderDocumentItem` per product (`{ product, quantity, locale }`). Per line it:
  - drops `imageUrl` and `thumbnailUrl`;
  - removes `taxClass` and replaces it with `taxRate` from `resolveTaxRate(taxClass)`;
  - leaves `rateType` untouched in the snapshot;
  - adds `preorder` only when `isPreorder({ releaseDate }, new Date())` is truthy.

## Relationships
- Uses `runWithLocale` and `localeCandidatesFor` from `src/infrastructure/i18n` (exported through `src/infrastructure/i18n/index.ts`; `catalog.ts` and `context.ts` sit behind it).
- Uses `resolveTranslations` from `src/kernel/translation.ts` for the per-locale lookup.
- Uses `isPreorder`, `resolveTaxRate` and `ProductSnapshot` from the `src/modules/products/index.ts` public index (the preorder, tax and product model logic in `src/modules/products/domain/preorder.ts`, `src/modules/products/tax.ts` and `src/modules/products/model.ts` live behind it).
- Returns `OrderDocumentItem` from `src/modules/orders/model.ts`.
- Exposed through `src/modules/orders/services/index.ts`. `freezeOrderLines` is the shared builder for every order-line writer (admin create, checkout, admin line edit), and `src/modules/orders/services/place.ts` is its likely caller.
- Covered by `src/modules/orders/tests/unit/snapshot.test.ts`.

## Notes
- `products` must be plain objects, not hydrated Mongoose documents. Call `.toObject()` on documents, never `.toJSON()`. `toJSON()` turns `_id` into a string `id`, so Mongoose mints a fresh `_id` on the embedded path. That silently breaks `orderRepository.search`'s `productId` filter on `items.product._id`.
- `locale` is bound explicitly instead of read from ambient context. The buyer's locale can differ from the locale the current request negotiated.
- `quantities` must match `products` in order and length. The code does not check this.
- `freezeOrderLines` does not check product visibility or sale status. A comment says checkout has already refused hidden or off-sale products, so only the release date decides `preorder`.
- Stamping `locale` once on every line makes "an order's lines share one locale" hold by construction.
