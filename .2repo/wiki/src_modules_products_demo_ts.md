# src/modules/products/demo.ts

## Purpose

Declares the products module's demo dataset — six fixtures chosen to exercise the branches the storefront and repositories actually have — and provides the seed/export functions that populate and publish those rows. The data lives here (in the owning module) rather than in a shared cross-repo fragment; the frontend receives a JSON snapshot via `scripts/export-demo-dataset.ts` instead of importing TypeScript source directly.

## Key elements

- **`SEED_PRODUCT_IDS`** — `as const` map from semantic names (`panino`, `carinoSoftDeleted`, `micionaOutOfStock`, `pufettino`, `bundleInactive`, `barebones`) to hex `_id` strings. Other modules' demos import this object instead of repeating hex literals.
- **`productFixtures`** — Array of six products built with `makeProduct`. Covers: a normal rich record, a soft-deleted record, an out-of-stock record, a second rich record, an inactive (but not deleted) record, and a barebones record with only required fields.
- **`seedProductById(productId)`** — Finds a fixture by id or throws a descriptive error. Used by `orders/demo.ts` to embed a product snapshot into order lines.
- **`seedProductsCollection()`** — Upserts every fixture through `productRepository` via `upsertById`. Called by the top-level seeder.
- **`exportSeededProducts()`** — Reads back the `products` collection (sorted by `_id`) for `scripts/export-demo-dataset.ts` to publish as stable JSON.

## Relationships

- **`./factory.ts`** — Provides `makeProduct`, the constructor used by every entry in `productFixtures`.
- **`./model.ts`** — Provides `productModel` (used by `exportSeededProducts`) and defines the `default:` values that `barebones` relies on.
- **`./repository.ts`** — Provides `productRepository`, the persistence target for `seedProductsCollection`.
- **`./module.ts`** — Registers/declares the `seedProductsCollection` and `exportSeededProducts` exports for the module boundary.
- **`src/infrastructure/persistence/seed.ts`** — Provides `upsertById`, `SeedOutcome`, and `exportCollection` primitives.
- **`src/modules/cart/demo.ts`** — Imports `SEED_PRODUCT_IDS` to reference products in cart line items.
- **`src/modules/orders/demo.ts`** — Imports `SEED_PRODUCT_IDS` and calls `seedProductById` to embed product snapshots in seeded orders.
- **`src/modules/wishlist/demo.ts`** — Imports `SEED_PRODUCT_IDS` to reference products in wishlist entries.

## Notes

- `carinoSoftDeleted` (has `deletedAt`) and `bundleInactive` (has `active: false`) are independent states; `publicScope()` requires both to pass, so the dataset keeps them separable.
- `micionaOutOfStock` has `onHand: 0` but remains active. The "units present but fully reserved" case is deliberately **not** seeded here — it only exists after a checkout, and `orders/demo.ts` documents why faking it would be racy.
- `barebones` omits every optional field on purpose: it is the only fixture that can surface frontend bugs from assuming non-empty `description`, `categories`, or `tags`. It is public so it appears in rendered lists.
- `seedProductById` throws rather than returning `undefined` — a missing id is treated as a corrupt fixture that should halt seeding, not produce a blank order line.
- The export is sorted by `_id` so `db/demo/demo-data.json` is byte-stable across runs and not dependent on Mongo natural order.
