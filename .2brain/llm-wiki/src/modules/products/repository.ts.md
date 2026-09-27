---
source: src/modules/products/repository.ts
sha256: 04bb09b6003bdecde128e4b470b0f426c415ebbdf2bab71ecaf7db897b2e0164
generated_at: 2026-09-27T15:33:12.568144+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/repository.ts

## Purpose

Defines and exports `productRepository`, the product catalogue's persistence layer. It composes the generic CRUD provided by `createRepository` with product-specific concerns: caller-scoped reads, public-visibility filtering, a single-snapshot facet aggregate, and three "derived write" ports (stock cache, translated fields, image digest) that other modules call to mirror already-decided state onto a product document without performing an admin edit.

## Key elements

- **`productRepository`** (exported const) – The sole export. Its type is written out explicitly (Mongoose generics trigger TS7056 at export boundaries). Extends `Repository<ProductDocument, Product>` with:
  - `publicScope()` – Returns a copy of the `PUBLIC_SCOPE` filter (`{ active: true, deletedAt: { $exists: false } }`).
  - `findByIdScoped(id, scope?)` – Single-query read combining `_id` and an optional authorization fragment; avoids the post-read visibility-check leak.
  - `findPublicById(id)` – `findByIdScoped` pre-bound to `PUBLIC_SCOPE`; used by cart/reorder and wishlist services.
  - `facets()` – One `$facet` pipeline (categories + tags) filtered by `PUBLIC_SCOPE`, so hidden products contribute nothing.
  - `syncStockCache(id, { onHand, reserved })` – Unconditional `$set` of stock counters; `timestamps: false`.
  - `writeTranslatedFields(id, fields)` – `$set` of named translation fields; `timestamps: false`.
  - `existsById(id)` – Scope-less existence check (translation port guard).
  - `writebackImage(documentId, key, urls)` – Conditional on `pendingImageKey` still matching `key`; on miss, checks whether the urls are already held to distinguish a duplicate job from a true failure.
- **`PUBLIC_SCOPE`** (module-level const) – The visibility predicate spread into public reads and the facet `$match`.
- **`searchable` config** – Declared inline in the `createRepository` call; maps filter keys (`title`, `active`, `deleted`, `price`, `category`, `tag`) to model columns with the appropriate query strategy (text, boolean, regex, array-regex, range).

## Relationships

- **`src/modules/products/model.ts`** – Supplies `productModel`, `applyProductTransform`, and the `ProductDocument` type consumed here.
- **`src/infrastructure/persistence/create-repository.ts`** – Supplies the `createRepository` factory, `toObjectId` helper, and the `Repository` interface that `productRepository` extends.
- **`src/infrastructure/adapters/image.worker.ts`** – Supplies the `ImageWriteback` type that `productRepository.writebackImage` must satisfy.
- **`src/types/index.ts`** – Supplies the `FacetCount` and `Product` types used in signatures.
- **`src/modules/products/service.ts`** – Primary consumer of `productRepository` for business-logic reads and writes.
- **`src/modules/products/module.ts`** – Wires `productRepository` into the module's dependency graph.
- **`src/modules/products/tests/integration/repository.test.ts`** – Integration tests exercising the exported methods directly.
- **`src/modules/products/tests/factories.ts`** – Provides test fixtures consumed by repository and service tests.
- **`tests/contract/request-contract.test.ts`**, **`tests/contract/product-write.test.ts`** – Contract tests that validate the repository's write surfaces (stock, image, translated fields) against expected schemas.

## Notes

- All "derived write" methods (`syncStockCache`, `writeTranslatedFields`, `writebackImage`) use `timestamps: false` deliberately — they mirror another module's decision and must not advance `updatedAt` as though an admin edited the product.
- `findByIdScoped` applies the scope *inside* the same Mongoose query as the `_id` lookup; never filter visibility after the fetch.
- `writebackImage` is idempotency-tolerant: a zero-match `updateOne` is followed by an existence probe on the target `imageUrl` so a duplicate worker delivery returns `true` instead of deleting live files.
- The `searchable.booleans` entry for `active` intentionally conflicts with a stranger's `PUBLIC_SCOPE` pin (`active: true`) on admin-effective queries, yielding an empty page rather than leaking unlisted products.
- `PUBLIC_SCOPE` is a `const` above the object literal because the methods reference it via `productRepository` (lazy property resolution); reading it back off the exported object avoids a circular import.
