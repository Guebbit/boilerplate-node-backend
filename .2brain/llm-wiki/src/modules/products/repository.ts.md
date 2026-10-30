---
source: src/modules/products/repository.ts
sha256: bf5286c02f05328fedb4678d6abfaa6d2412cc70b5027d658890ac91722e2dcc
generated_at: 2026-10-29T05:28:04.379096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/repository.ts

## Purpose

Defines the product catalogue's data-access layer: standard CRUD inherited from the shared repository factory, plus the catalogue's own query rules (public scoping, facet counts, sitemap-style listing) and the stock-cache mirror that `@modules/inventory` writes through. It exists so every product read and write in the module goes through one object with a consistent visibility contract.

## Key elements

- **`productRepository`** (exported const) — the single entry point. Spreads `createRepository(productModel, { transform, searchable })` and adds the domain methods below. Its type is written out explicitly (not inferred) because Mongoose generics exceed TypeScript's ability to serialize at an export boundary (TS7056).
- **`PUBLIC_SCOPE`** (module-local const) — `{ active: true, deletedAt: { $exists: false } }`. Spread into every "public" query so a hidden or soft-deleted product never leaks.
- **`publicScope()`** — returns a fresh copy of `PUBLIC_SCOPE` for callers outside this file.
- **`findByIdScoped(id, scope?)`** / **`findByIdRawScoped(id, scope)`** / **`findPublicById(id)`** — scoped single-document finds. Scope is merged into the same Mongoose query (not checked after the read). `findPublicById` is `findByIdScoped` bound to `PUBLIC_SCOPE`.
- **`facets()`** — one `$facet` aggregation pipeline producing category and tag counts restricted to `PUBLIC_SCOPE`. Single pipeline guarantees both lists count against the same snapshot.
- **`listedPage(skip, limit)`** — paginated public catalogue returning only `{ id, updatedAt }`. Sorts by `_id` (stable as catalogue grows at the tail) and projects one field to keep 50 k-row pages small.
- **`syncStockCache(id, counters, session?)`** — unconditional `$set` of `StockCounters` onto the product document. `timestamps: false`; returns the pre-write doc. Joins a caller-supplied `ClientSession` when present.
- **`translatable`** — wired via `translatableColumnsOf(productModel)` for the i18n column registry.
- **`writebackImage`** — wired via `imageWritebackFor(productModel)`; conditional on `pendingImageKey` still matching so a stale job can't clobber a later upload. `timestamps: false`.
- **`ListedProduct`** (exported interface) — `{ id: string; updatedAt?: Date }`, the minimal shape `listedPage` returns.
- **`StockCounters`** (exported interface) — the four numeric fields (`onHand`, `reserved`, `backorderLimit`, `backordered`) that `inventory` copies onto a product.

## Relationships

- **`src/modules/products/model.ts`** — supplies `productModel` (Mongoose model) and `applyProductTransform` (the document→DTO mapper passed to the factory).
- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory, `toObjectId`, and the `Repository` base type that `productRepository` extends.
- **`src/infrastructure/persistence/translatable-columns.ts`** — supplies `translatableColumnsOf`, which builds the `translatable` member.
- **`src/infrastructure/persistence/image-writeback.ts`** — supplies `imageWritebackFor`, which builds the `writebackImage` member.
- **`src/infrastructure/adapters/image.worker.ts`** — provides the `ImageWriteback` type for the `writebackImage` field.
- **`src/modules/products/services/*`** (`crud`, `lookups`, `read`, `remove`, `search`) — consume `productRepository` for all their data access.
- **`src/modules/products/module.ts`** — registers the repository in the module's DI / composition graph.
- **`src/modules/cart/tests/integration/*`** — exercise scoped finds and stock-cache sync through the repository.
- **`src/modules/products/tests/contract/api.contract.test.ts`** — validates the repository's public surface against a contract.
- **`scenarios/products.ts`** — integration scenarios that drive the repository end-to-end.

## Notes

- `PUBLIC_SCOPE` is a `const` declared above the object literal so three members (`findPublicById`, `facets`, `listedPage`) can reference it; reading it back off `productRepository` at runtime would require lazy property resolution and is intentionally avoided.
- `syncStockCache` is deliberately unguarded (no `if` on existence, no conditional `$set`). The invariant is: `@modules/inventory` has already decided the stock state; this method only copies it.
- Both `syncStockCache` and `writebackImage` pass `timestamps: false` so Mongoose does not bump `updatedAt` on what are system writes, not admin edits.
- The `searchable` config in `createRepository` maps every filter/sort knob (`active`, `purchasable`, `deleted`, price range, text, regex, array, booleans, presence) to the concrete Mongo columns. The `title` regex and sort entries target the fallback-locale column — the same one the public catalogue exposes.
- `findByIdScoped` is `async` (not just returning a promise) because `toObjectId` can *throw* on a malformed id; wrapping in `async` turns that into a rejected promise.
