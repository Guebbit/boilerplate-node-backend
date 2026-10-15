---
source: src/modules/products/repository.ts
sha256: eed5fbb17a9c3b6a91b395c59010e621bd49b88ced7e8b2cb646216515861921
generated_at: 2026-10-15T11:43:26.838699+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/repository.ts

## Purpose

Defines the product catalogue's data-access layer: a `createRepository`-based CRUD object extended with scoping helpers, a single-pass facet aggregation, and three "derived-write" ports (stock mirror, translation writeback, image digest writeback) that other modules call to copy pre-decided values onto the product document without triggering admin-edit semantics.

## Key elements

- **`PUBLIC_SCOPE`** (module-private const) — `{ active: true, deletedAt: { $exists: false } }`; the canonical "visible to non-admin" filter. Spread into any query that must exclude hidden/draft products.
- **`productRepository`** (exported const) — the single public entry point. Combines:
  - Base CRUD from `createRepository(productModel, …)` with a `searchable` config (text, regex, boolean, presence, range, sortable) used by the search service.
  - `publicScope()` — returns a defensive copy of `PUBLIC_SCOPE` for callers outside this file.
  - `findByIdScoped(id, scope?)` — single query combining `_id` lookup with an optional caller-supplied filter; `undefined` scope = unrestricted (admin).
  - `findPublicById(id)` — convenience wrapper: `findByIdScoped` bound to `PUBLIC_SCOPE`.
  - `facets()` — one `$facet` aggregation returning category and tag counts, filtered to public scope, sorted by count desc then name.
  - `syncStockCache(id, counters)` — unconditional `$set` of `onHand`/`reserved`; `timestamps: false` (not an admin edit).
  - `writeTranslatedFields(id, fields, session?)` — copies fallback-locale translation fields onto the document; `null` values become `''`; participates in the caller's Mongoose session.
  - `markEdited(id, session?)` — stamps `updatedAt` so the revision/ETag counter advances after a translation write, even when no other column changed.
  - `existsById(id)` — unscoped existence check (used before translation writes).
  - `writebackImage(documentId, key, urls)` — conditional on `pendingImageKey` still matching; on a miss, re-checks whether the URLs are already stored (duplicate job delivery).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies `createRepository`, `toObjectId`, and the `Repository` base type that `productRepository` extends.
- **`src/modules/products/model.ts`** — supplies `productModel`, `applyProductTransform` (used as the `transform` option), and the `ProductDocument` type.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type that `writebackImage` implements.
- **`src/modules/products/services/crud.ts` / `read.ts` / `remove.ts` / `search.ts` / `lookups.ts` / `image.ts`** — consume `productRepository` methods (CRUD, scoping, facets, search config, image writeback).
- **`src/modules/products/module.ts`** — wires the repository into the module's dependency graph.
- **`src/modules/products/tests/…`** — contract, integration, and factory tests exercise the repository directly (especially `facets`, `delete-outbox`, and `api.contract`).
- **`scenarios/products.ts`** — end-to-end product scenarios that flow through this repository.

## Notes

- The exported type annotation is **written out explicitly** (not `as const` / inferred) because Mongoose's generic resolution produces a type too large for TypeScript to serialize at an export boundary (TS7056). Do not "simplify" it back to inference.
- `toObjectId` **throws** on malformed ids; every method that calls it is therefore `async` even if the underlying Mongoose call is synchronous. Callers must handle the rejection.
- `timestamps: false` on `syncStockCache`, `writeTranslatedFields`, `markEdited`, and `writebackImage` is intentional: these are derived/mirror writes, not admin edits, and must not bump the document's Mongoose-managed `updatedAt`. `markEdited` compensates by stamping `updatedAt` by hand so the revision counter still advances.
- `writebackImage` guards on `pendingImageKey: key` to prevent a stale or duplicate job from overwriting a newer upload. A `matchedCount === 0` result does **not** mean failure if the URLs are already present (duplicate delivery); the fallback `exists` check returns `true` in that case.
- `facets()` reuses `PUBLIC_SCOPE` in its `$match`, so categories/tags held only by hidden products are excluded — a chip in the UI will always have matching results.
