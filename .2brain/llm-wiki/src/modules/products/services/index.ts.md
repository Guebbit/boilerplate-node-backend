---
source: src/modules/products/services/index.ts
source_sha256: 9188742bb9707e7d752f79d3afa0cdb5009054b6ce07888a18a32d463878866a
context_sha256: 30206741c2194cfb5009e44d89521f7626b22867226366216ba3e261d3b37bf9
generated_at: 2026-11-22T07:12:55.409591+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/index.ts

## Purpose
Barrel for the product service. It assembles the per-flow service files (`search`, `read`, `translated-write`, `remove`, `lookups`) into a single `productService` object. Controllers and sibling modules call the catalogue through this object only.

## Key elements
- **`productService`** is the public surface. It groups these members:
  - Scope and reads: `callerScope`, `getById`, `getByIdForCaller`.
  - Search: `search`, `searchForCaller`, `facets`.
  - Writes: `create`, `updateById`, `clearOmittedLocales`. These come from `translated-write`, so a product is written together with its translation rows.
  - Deletion: `removeById`, `restoreById`.
  - Lookups for sibling modules: `findByIdRaw`, `findByIdRawScoped`, `isLive`, `findPublicById`, `findManyByIds`, `countPublic`, `listPublicPage`, `countListed`, `titlesOf`, `titlesById`.
  - Presentation: `presentForCaller`. The barrel publishes no standalone presenter function, so siblings reach it through the service.
  - Validation schemas: `zodProductCreateSchema`, `zodProductReplaceSchema`, `zodProductUpdateSchema`, re-exposed from `../model`. The update controller's factory uses them to validate PUT/PATCH bodies, and controllers may not import `./model` directly.
- **`canSeeStock`** is re-exported from `./stock-view`. It decides whether a caller may read exact stock, and is published so a sibling's refusal can say the same thing.

## Relationships
- Imports the implementations from `./search`, `./read`, `./translated-write`, `./remove`, `./lookups` and `./stock-view`, plus the Zod schemas from `../model`.
- The graph lists the cart module (`src/modules/cart/module.ts`, `src/modules/cart/services/items.ts`, `src/modules/cart/services/merge.ts`, `src/modules/cart/services/shelf.ts`, `src/modules/cart/services/view.ts`) and its contract and integration tests as neighbors. They relate to the product service through the dependency graph. The file's own comments describe the lookups as the door siblings read and cache through, and `presentForCaller` and `canSeeStock` as the shared helpers for shaping products and for refusals. The file does not show which neighbor calls which member.

## Notes
- The file holds no logic of its own. It only wires, so behavior changes belong in the per-flow files.
- `create` and `updateById` write translations with the product. No exposed door moves a title without its fallback-locale row.
- `crud.ts` is mentioned in the module doc comment, but this file imports no `crud` module. It imports `create` and `updateById` from `translated-write`.
