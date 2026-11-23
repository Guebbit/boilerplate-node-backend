---
source: scenarios/values/cart.ts
source_sha256: 3cd4bde6eb1cea83f3015ec9964beb15e123fb921d449a86864ad0244df8a164
context_sha256: 3710050abb21d2e719759f008be1c9ee8c969ab5db51a38be9eb6c242d87068b
generated_at: 2026-11-22T01:50:08.844678+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/values/cart.ts

## Purpose
Supplies the `cart` example values used by the generated API client collections. It is a small data-only module that declares what sample values to use for cart-related properties.

## Key elements
- `collectionValues` (exported const, typed `CollectionValues`): `{ byProperty: { quantity: 2 } }`. It sets the example value of any property named `quantity` to `2`.

## Relationships
- Imports the `CollectionValues` type from `scenarios/collection-values.ts` (type-only import), which defines the shape this export must match.

## Notes
- Values are keyed by property name (`byProperty`), not by full path, so the `quantity` value applies wherever a property of that name appears in the cart collection.
