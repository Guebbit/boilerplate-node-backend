---
source: src/modules/products/services/index.ts
sha256: d4e17f629e2727406326217cce9ca4101a0692f61ba016e5e348ec0b27b45780
generated_at: 2026-10-15T11:44:31.239514+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/index.ts

## Purpose

Barrel file that aggregates every product-service operation into a single public surface (`productService`) and also re-exports each function by name. It exists as a folder (not one file) because the module passed ~800 lines; see `docs/theory/layers.md`. All controllers and cross-module callers must go through this file — it enforces the "persistence wall" that keeps controllers from reaching `./presenter` or `./model` directly.

## Key elements

- **`toProduct(document, caller?)`** — Shapes a `ProductDocument` into the wire-level `Product` type, applying `redactStock` + `canSeeStock`. Stock *counters* appear only when `caller` holds `inventory.any.read`; `inStock`/`lowStock` flags are visible to everyone. `caller` may be `undefined` (no request context) — in that case no counters are shown.
- **`productService`** — The object every controller and cross-module caller uses. Groups all search, read, write, delete, lookup, and shaping functions behind one import.
- **Named re-exports** — `search`, `searchForCaller`, `facets`, `callerScope`, `getById`, `getByIdForCaller`, `getAdmin`, `create`, `update`, `updateById`, `writeCreate`, `writeUpdate`, `clearOmittedLocales`, `remove`, `removeById`, `restoreById`, `canSeeStock`. Published by name so test suites can drive operations directly and the surface doesn't shrink when a sub-file moves.
- **Zod schema re-exports** — `zodProductCreateSchema`, `zodProductReplaceSchema`, `zodProductUpdateSchema` are re-exported here so the update controller's validation factory can use them without importing `../model`.
- **Lookup re-exports** — `findByIdRaw`, `findPublicById`, `findManyByIds`, `countPublic`, `syncStockCache`, `titlesOf`, `titlesById` (from `./lookups`) are the read path sibling modules (cart, delivery) call and cache through.

## Relationships

- **Cart services** (`items.ts`, `merge.ts`, `reorder.ts`, `shelf.ts`, `view.ts`) consume the lookup functions (`findPublicById`, `findManyByIds`, `titlesOf`, `titlesById`, etc.) to resolve product availability and line data during cart operations.
- **Delivery services** (`slip.ts`) use the same lookup path to render delivery slips and preorder boards.
- **Cart integration tests** (`checkout-expected-total`, `line-availability`, `merge`, `preorder`, `service`, `stock-flag`, `stock`) import named exports from this file to drive product-service behaviour end-to-end.
- **Delivery integration tests** (`preorder-board`, `preorder-late`) do the same for delivery-specific scenarios.
- **Internal sub-files** (`./search`, `./read`, `./crud`, `./translated-write`, `./remove`, `./lookups`, `./stock-view`) provide the actual implementations; this file only re-exports and composes them.
- **`../presenter`** and **`../model`** are imported here *solely* to expose `toProduct` and the zod schemas through the service surface, shielding controllers from direct access.

## Notes

- Dual-publishing convention: every operation is available both as a named export and as a key on `productService`. Adding a new operation requires both.
- The "persistence wall" is intentional: if a controller needs a presenter or model symbol, it must be re-exported through this file (as `toProduct` and the zod schemas already are). Do not add a direct `import` from a controller to `../presenter` or `../model`.
- `toProduct` is not a pure presentation helper — it embeds the authorization check (`canSeeStock`) so the same redaction rule is enforced everywhere the wire shape is built.
- `caller` in `toProduct` is optional; passing `undefined` is the documented path for non-request contexts (background jobs, cache warmers) and silently drops stock counters.
