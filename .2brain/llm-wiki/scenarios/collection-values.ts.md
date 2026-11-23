---
source: scenarios/collection-values.ts
source_sha256: 22ccfa8e45dd7594b7e8194be4f1006140d6ee2dc2ede86234ffe53581ecf55c
context_sha256: 0660275ade2660d68b4fd1b7fcf6ef2c9507a550695553f67f53490ed4f4376a
generated_at: 2026-11-22T01:42:05.775744+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/collection-values.ts

## Purpose
Defines the `CollectionValues` interface: the shape of what a single module contributes as example values for the generated API client collections. Each module keeps its values next to its other fixtures in `scenarios/values/<module>.ts`, so they travel with the module and nothing central needs to list them.

## Key elements
- `CollectionValues` (interface, the only export). All fields are optional:
  - `byProperty` – read-only map of property name → `string | number | boolean`, used wherever a generated body or query carries that property.
  - `tokens` – read-only map of `{{token}}` names a probe may use to the string each resolves to.
  - `pathParam(name, template)` – returns a path parameter's value given its name and the path template it appears in, or `undefined` if the module has no opinion.

## Relationships
- `scripts/contracts/client-collections-bundle.ts` scans `scenarios/values/<module>.ts` and merges what each exports as `collectionValues`.
- `scenarios/values/cart.ts`, `orders.ts` and `products.ts` are module value files that provide `collectionValues` conforming to this shape.

## Notes
- Modules must export their contribution under the name `collectionValues` for the bundler to pick it up.
- This file holds types only, with no runtime logic.
