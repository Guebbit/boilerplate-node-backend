# src/modules/products/demo.ts

## Purpose

Defines the full product demo dataset (6 named edge-case rows + 126 combinatorial filler rows) and exposes the seed/export operations the CLI and paired frontend consume. It exists as the single source of truth for catalogue fixtures so that `rm -rf src/modules/products` removes the data alongside the module, and so `scripts/export-demo-dataset.ts` can publish `db/demo/demo-data.json` without the frontend needing access to backend source.

## Key elements

- **`SEED_PRODUCT_IDS`** — Named hex-string IDs for the six hand-crafted products (`panino`, `carinoSoftDeleted`, `micionaOutOfStock`, `pufettino`, `bundleInactive`, `barebones`). Other modules import these names instead of repeating raw IDs.
- **`namedProducts`** (internal) — Six `makeProduct` records chosen to exercise real branches: soft-deleted, out-of-stock, inactive, and a deliberately minimal record (`barebones`) that omits every optional field to rely on `./model` defaults.
- **`fillerProductRows`** (internal) — 126 rows from `FILLER_PRODUCTS` mapped with a deterministic ID (`fillerProductId(index)`) and an image cycled from a fixed 20-image pool (`FILLER_IMAGE_ROLE_KEYS`).
- **`productFixtures`** (exported) — Concatenated array of all 132 product records.
- **`seedProductById(productId)`** (exported) — Finds a fixture by `_id` string or throws a descriptive error. Used by `orders/demo.ts` which embeds a product *snapshot* rather than a reference.
- **`seedProductsCollection()`** (exported) — Upserts every fixture via `productRepository`; returns `Promise<SeedOutcome[]>`. Declared in `module.ts`, called by `db/demo/index.ts`.
- **`exportSeededProducts()`** (exported) — Reads the collection back through `productModel` with a `_id: 1` sort for byte-stable output; called by `scripts/export-demo-dataset.ts`.
- **`fillerProductId`** (re-exported from `./demo-catalog`) — Allows `cart/demo.ts` and `orders/demo.ts` to address a specific filler row through this module's public path, satisfying the `boundaries/dependencies` lint rule.

## Relationships

- **`./fixtures.ts`** — Provides `makeProduct`, the factory every row in this file is built with.
- **`./model.ts`** — Provides `productModel` (used by `exportSeededProducts`) and the `default:` values that `barebones` relies on for omitted fields.
- **`./repository.ts`** — Provides `productRepository`, passed to `upsertById` in `seedProductsCollection`.
- **`./demo-catalog.ts`** — Source of `FILLER_PRODUCTS`, `FILLER_IMAGE_ROLE_KEYS`, and `fillerProductId`.
- **`@infrastructure/persistence/seed.ts`** — Provides `upsertById`, `SeedOutcome`, and `exportCollection` used by the seed and export functions.
- **`./module.ts`** — Declares `seedProductsCollection` and `exportSeededProducts` as the module's public seed/export surface.
- **`../cart/demo.ts`**, **`../orders/demo.ts`**, **`../wishlist/demo.ts`** — Consume `SEED_PRODUCT_IDS` and `seedProductById` to reference specific products by name; `orders` additionally embeds the returned record as a snapshot.

## Notes

- All images come from `demo-images.generated.json` (produced by `npm run seed:images`); none are hand-placed. The 20-image pool is cycled across 126 filler rows so the grid never requires more downloads.
- `barebones` intentionally omits `description`, `categories`, `tags`, `onHand`, `imageUrl`, etc., so any card or filter that assumes those fields exist will break visibly. It is the only record with empty categories.
- `exportSeededProducts` sorts by `_id` explicitly; without this the published JSON would depend on Mongo's natural insertion order and differ across runs.
- The re-export of `fillerProductId` is a deliberate boundary enforcer: the lint rule `boundaries/dependencies` prevents `cart/demo.ts` and `orders/demo.ts` from importing `./demo-catalog` directly, so they must route through this file.
