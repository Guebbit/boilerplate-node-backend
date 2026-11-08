---
source: src/modules/products/repository.ts
sha256: 992ed01d8b7258ad5ca3fb5bdea8518fe9439b6311a851aed195bd32e2c4321b
generated_at: 2026-11-08T07:46:28.238410+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/repository.ts

## Purpose

Defines `productRepository`, the catalogue's data-access object. It composes the generic Mongoose CRUD from the repository factory with the catalogue's own query rules (public scoping, facets, sitemap listing, stock-cache mirroring, image writeback, and translatable columns). It exists as a single exported const so that services and tests interact with the product collection through one surface rather than touching the Mongoose model directly.

## Key elements

- **`PUBLIC_SCOPE`** (module-private) — the visibility filter `{ active: true, deletedAt: null }` applied to every public-facing query. Exported to callers via `publicScope()`.
- **`ListedProduct`** (interface) — the minimal shape (`id`, `updatedAt?`) returned by `listedPage` for sitemap generation.
- **`StockCounters`** (interface) — the stock fields (`onHand`, `reserved`, `backorderLimit`, `backordered`) that `@modules/inventory` copies onto a product document.
- **`productRepository`** — the exported repository object:
  - Base CRUD + search configuration (objectIds, text, arrayRegex, regex, booleans, presence, ranges, sortable) via `createRepository`.
  - `findByIdScoped(id, scope?)` / `findByIdRawScoped(id, scope)` — single-document reads where the authorization scope is part of the same query (not a post-filter).
  - `findPublicById(id)` — `findByIdScoped` bound to `PUBLIC_SCOPE`.
  - `listedPage(skip, limit)` — paginated `_id`-ordered projection of public products.
  - `facets()` — one `$facet` aggregation returning counted `categories` and `tags` for the public catalogue.
  - `syncStockCache(id, counters, session?)` — unconditional `$set` of stock counters; returns the pre-write document.
  - `translatable` — i18n column metadata derived from `productModel`.
  - `writebackImage` — image-digest writeback bound to the products collection.

## Relationships

- **`./model`** — imports `productModel` (the Mongoose model) and `applyProductTransform` (the document→DTO transform passed to the factory).
- **`@infrastructure/persistence/create-repository`** — imports `createRepository` (base CRUD + search config), `toObjectId` (safe cast), and the `Repository` / `Lean` types.
- **`@infrastructure/persistence/image-writeback`** — imports `imageWritebackFor` to build the `writebackImage` member.
- **`@infrastructure/adapters/image.worker`** — imports the `ImageWriteback` type for the `writebackImage` member's signature.
- **`@infrastructure/persistence/translatable-columns`** — imports `translatableColumnsOf` and `TranslatableColumns` to build the `translatable` member.
- **`src/modules/products/services/*`** (`crud`, `read`, `search`, `remove`, `lookups`) — consume `productRepository` for all catalogue reads/writes.
- **`src/modules/products/module.ts`** — wires `productRepository` into the module's dependency graph.
- **`src/modules/cart/tests/integration/*`** — exercise `syncStockCache` and scoped reads as part of cart/checkout flows.
- **`src/modules/products/tests/contract/api.contract.test.ts`** — validates the repository's public surface against an API contract.
- **`scenarios/products.ts`** — provides test data/scenarios used by the above tests.

## Notes

- The explicit interface on `productRepository` is required because TypeScript cannot serialize an inferred type through an export boundary when Mongoose generics are involved (TS7056). Do not "simplify" it back to an inferred `typeof`.
- `syncStockCache` uses `returnDocument: 'before'` and `timestamps: false` on purpose: it is a mirror write, not an edit, and callers need the prior stock state.
- `facets()` uses a single `$facet` stage so categories and tags are counted against the same snapshot; splitting into two aggregations would introduce a TOCTOU gap.
- `PUBLIC_SCOPE.deletedAt` is `null`, not `undefined`, so the query matches both `null` and missing-field documents.
- The `booleans` search config includes `active` and `purchasable`; when a non-admin scope pins `active: true`, a contradictory `purchasable: false` filter yields an empty page rather than leaking hidden catalogue.
