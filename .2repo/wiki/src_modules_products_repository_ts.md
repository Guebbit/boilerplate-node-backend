# src/modules/products/repository.ts

## Purpose
The catalogue's data-access layer. It wraps the shared `createRepository` factory with product-specific search config, public-visibility scoping, facet counting, and the atomic counter transitions (`onHand` / `reserved`) that back the inventory module. It is the single write-path for stock counters and the read-path for the public product API.

## Key elements
- **`productRepository`** – the exported singleton. Extends `Repository<ProductDocument>` with the methods below. The interface is written out by hand because Mongoose generics exceed TypeScript's inline type-size limit (TS7056) at an export boundary.
- **`PUBLIC_SCOPE`** (module-private `const`) – `{ active: true, deletedAt: { $exists: false } }`. Spread into any filter to restrict a read to published, non-deleted products.
- **`publicScope()`** – returns a defensive copy of `PUBLIC_SCOPE` for callers outside this module.
- **`findByIdScoped(productId, scope?)`** – id lookup + optional authorization fragment in one query (no post-read visibility check).
- **`findPublicById(productId)`** – `findByIdScoped` pre-bound to `PUBLIC_SCOPE`; used by `cart/services/reorder.ts` and `wishlist/service.ts`.
- **`facets()`** – single `$facet` aggregation returning counted categories and tags, scoped to `PUBLIC_SCOPE`.
- **`reserveUnits(productId, quantity)`** – conditional `$inc: { reserved: +q }`; guard (`onHand − reserved ≥ q`) is in the filter via `$expr` for atomicity. Returns `boolean`.
- **`commitUnits(productId, quantity)`** – decrements both `onHand` and `reserved` together; guard requires both counters ≥ quantity.
- **`releaseUnits(productId, quantity)`** – decrements only `reserved`; guarded so a double-release matches nothing.
- **`receiveUnits(productId, quantity)`** – increments `onHand`; only guard is that the product exists.
- **`adjustUnits(productId, delta)`** – signed stocktake; `$expr` guard ensures `onHand + delta ≥ reserved` (availability can never go negative).
- **`countLowAvailability(threshold)`** – counts publicly visible products whose availability ≤ threshold.
- **`sumReserved()`** / **`availabilityPage(options)`** – read-side aggregates for the stock board and admin dashboard.
- **`writebackImage`** – an `ImageWriteback` handler (from `image.worker`) for persisting generated thumbnails back onto the product.

## Relationships
- **`create-repository.ts`** – provides `createRepository` (base CRUD, search, `toObjectId`) and the `Repository<T>` type that `productRepository` extends.
- **`image.worker.ts`** – supplies the `ImageWriteback` type consumed by `writebackImage`.
- **`modules/inventory/service.ts`** – orchestrates *which* counter transition is legal when; this file only owns the atomic writes.
- **`modules/inventory/metrics.ts`** – reads the counters via `sumReserved`, `countLowAvailability`, `availabilityPage`.
- **`modules/cart/services/items.ts`** – calls `reserveUnits` / `releaseUnits` when a cart is held or dropped.
- **`modules/cart/services/reorder.ts`** – calls `findPublicById` to validate a re-ordered product is still visible.
- **`modules/orders/service.ts`** – calls `commitUnits` on payment, `releaseUnits` on cancellation.
- **`scripts/backfill-image-thumbnails.ts`** – invokes `writebackImage` in a one-off migration context.
- **`modules/inventory/tests/…`**, **`modules/cart/tests/…`**, **`modules/orders/tests/…`**, **`modules/payments/tests/…`** – integration and property tests that exercise the counter transitions and scoping rules through the service layers.

## Notes
- Every counter transition is a **single conditional `updateOne`**; the guard lives in the filter so mongod enforces it atomically. None returns `void` — an unmatched write returns `false` so callers can react (the old `incrementStock` lost units silently on a race).
- All inventory writes pass `{ timestamps: false }` — stock movement is not a catalogue edit and must not bump `updatedAt`.
- `$expr` is used wherever the guard references two fields of the same document (`onHand − reserved ≥ q`); a static field filter cannot express that.
- `PUBLIC_SCOPE` is a `const` above the object literal (not read off `productRepository`) because the self-referential object is not yet constructed at that point; the `publicScope()` method exists so external callers get a copy without touching the internal const.
- The `searchable` config maps `title` to both `text` (full-text) and `regex` (substring) because the public catalogue exposes both search modes on the same column.
- `booleans: { active: 'active' }` interacts with `PUBLIC_SCOPE`: a non-admin caller's scope pins `active: true`, so a search for `active: false` yields an empty page rather than listing hidden products — this is intentional, not a bug.
