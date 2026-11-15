---
source: src/modules/products/services/index.ts
sha256: d1d96e7489f6009114bf3147501605afb9999f3f3c764549acaadcdde82476d5
generated_at: 2026-11-14T21:27:45.846929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/index.ts

## Purpose

Barrel/facade for the product module's service layer. It re-exports the individual flow files (`search`, `read`, `translated-write`, `remove`, `lookups`, `stock-view`) and the Zod schemas from `../model`, then assembles them into a single `productService` object. Controllers and sibling modules interact with the catalogue exclusively through this one object; they never reach the individual flow files or the model directly.

## Key elements

- **`productService`** (exported const) — the sole public surface. Aggregates:
  - *Read / search:* `search`, `searchForCaller`, `facets`, `getById`, `getByIdForCaller`, `callerScope`, `presentForCaller`
  - *Write:* `create`, `updateById`, `clearOmittedLocales`
  - *Delete / restore:* `removeById`, `restoreById`
  - *Lookup / cache (sibling-facing):* `findByIdRaw`, `findByIdRawScoped`, `isLive`, `findPublicById`, `findManyByIds`, `countPublic`, `listPublicPage`, `countListed`, `syncStockCache`, `titlesOf`, `titlesById`
  - *Validation schemas:* `zodProductCreateSchema`, `zodProductReplaceSchema`, `zodProductUpdateSchema`
- **`canSeeStock`** (named re-export from `./stock-view`) — exported at module level (not inside `productService`) so a sibling can state the same stock-visibility rule in its own refusal messages.

## Relationships

- **`src/modules/cart/module.ts`** and the cart service files (`src/modules/cart/services/items.ts`, `src/modules/cart/services/merge.ts`, `src/modules/cart/services/shelf.ts`, `src/modules/cart/services/view.ts`): primary consumers of the lookup/cache helpers (`isLive`, `findManyByIds`, `titlesOf`, `titlesById`, `syncStockCache`, `countPublic`, etc.) exposed on `productService`. The cart reads product state through this facade rather than importing flow files directly.
- **Cart test suites** (`src/modules/cart/tests/contract/api.contract.test.ts`, `src/modules/cart/tests/integration/checkout-expected-total.test.ts`, `src/modules/cart/tests/integration/checkout-interleavings.test.ts`, `src/modules/cart/tests/integration/checkout-stock-divergence.test.ts`, `src/modules/cart/tests/integration/line-availability.test.ts`, `src/modules/cart/tests/integration/merge.test.ts`, `src/modules/cart/tests/integration/preorder.test.ts`, `src/modules/cart/tests/integration/product-removal-protects-orders.test.ts`, `src/modules/cart/tests/integration/product-restored-meanwhile.test.ts`, `src/modules/cart/tests/integration/service.test.ts`): exercise cart flows that internally call `productService` lookups, stock sync, and product-removal/restoration paths.

## Notes

- The barrel deliberately re-exposes `presentForCaller` (a presenter helper) and the Zod schemas on the service object so that controllers and sibling modules never import `./read` or `../model` directly. If you need one of those, go through `productService`.
- `canSeeStock` is the one export that lives *outside* `productService`; import it by name from this module.
- The file's docblock references `docs/theory/layers.md` for the "one file per flow" convention that the sibling files follow.
