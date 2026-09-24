---
source: src/modules/products/repository.ts
sha256: 058ed47a3fcdccd6d817749d812ddc34de4054420b4044fa27fed61f63d02147
generated_at: 2026-09-23T19:28:03.777691+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/repository.ts

## Purpose

Exports the single `productRepository` object for the catalogue: the standard CRUD surface produced by the shared `createRepository` factory, extended with product-specific query rules (public scoping, facet counting) and two write-through mirrors that the inventory module and the image-digest pipeline call into. It is the one place that talks to the `productModel` for reads, scoped reads, and the two side-channel writes.

## Key elements

- **`PUBLIC_SCOPE`** (module-private const) — the filter fragment `{ active: true, deletedAt: { $exists: false } }` that defines "visible to non-admin callers." Spread into `findPublicById`, `facets`, and returned (defensively copied) by `publicScope()`.
- **`productRepository`** (exported const) — the composite object. Its explicit type annotation is written out by hand because Mongoose's generics overflow TS's inference at an export boundary (TS7056).
  - **Base CRUD + `searchable` config** — spread from `createRepository(productModel, { transform, searchable })`. The `searchable` block declares which fields respond to `id`, `title`, `category`, `tag`, `active`, and `price` (min/max) filters.
  - **`publicScope()`** — returns a shallow copy of `PUBLIC_SCOPE` for callers outside this module.
  - **`findByIdScoped(productId, scope?)`** — single query that applies both the `_id` lookup and the caller's authorization filter atomically. No scope → unrestricted (admin path).
  - **`findPublicById(productId)`** — `findByIdScoped` bound to `PUBLIC_SCOPE`; the entry point for cart-reorder and wishlist lookups.
  - **`facets()`** — one `$facet` aggregation (categories + tags) pre-filtered by `PUBLIC_SCOPE`; returns `{ categories: FacetCount[], tags: FacetCount[] }` sorted by count desc, name asc.
  - **`syncStockCache(productId, counters)`** — unconditional `$set` of `{ onHand, reserved }`; `timestamps: false`. The inventory module decides; this only copies.
  - **`writebackImage(documentId, key, urls)`** — conditional `$set`/`$unset` of `imageUrl`/`thumbnailUrl` and `pendingImageKey`, guarded on `pendingImageKey` still matching the job's `key`; returns `matchedCount > 0`.

## Relationships

- **`src/modules/products/model.ts`** — provides `productModel` (the Mongoose model used for every query here), `applyProductTransform` (the document→DTO mapper passed to the factory), and the `ProductDocument` type.
- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory, the `toObjectId` helper (throws on malformed ids), and the `Repository` base type that `productRepository` extends.
- **`src/infrastructure/adapters/image.worker.ts`** — contributes the `ImageWriteback` type that `writebackImage` must satisfy.
- **`src/types/index.ts`** — source of the `FacetCount` and `Product` types used in signatures.
- **`src/modules/products/service.ts` / `module.ts`** — the module wiring that exposes `productRepository` to the service layer and DI container.
- **`src/modules/products/tests/integration/repository.test.ts`** — direct integration tests against this file's query logic.
- **`src/modules/products/tests/contract/api.contract.test.ts`** — contract tests that exercise the public API surface this repository backs.
- **`scenarios/products.ts`** — scenario definitions that depend on the product catalogue's query behavior.

## Notes

- The exported type is **hand-written**, not inferred. If you add a method to the object literal, you must also add it to the type annotation or TS will not see it.
- `PUBLIC_SCOPE` is a `const` above the object literal rather than a property on `productRepository` because three methods need it *during* object construction; reading it back off the object would require lazy property resolution.
- `findPublicById` and `facets` deliberately use the **same** `PUBLIC_SCOPE` object so that a product hidden from the list is also hidden from the facet chips—no second source of truth.
- Both `syncStockCache` and `writebackImage` pass `timestamps: false`. Do not "fix" this: those writes are system mirrors, not admin edits, and bumping `updatedAt` would corrupt audit trails.
- `writebackImage` is idempotent-by-design: a duplicate job delivery will match zero rows (the `pendingImageKey` was already cleared) and return `false` rather than corrupting a newer upload.
- `toObjectId` (from the factory module) **throws** on a malformed id string; every method that accepts a raw `productId` is therefore `async` or wrapped so the throw is caught by the caller, not silently swallowed.
