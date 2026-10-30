---
source: scenarios/values/cart.ts
sha256: 3cd4bde6eb1cea83f3015ec9964beb15e123fb921d449a86864ad0244df8a164
generated_at: 2026-10-29T01:27:56.269704+00:00
model: ollama:qwen3.8:27b
---

# scenarios/values/cart.ts

## Purpose

Provides the canonical example values for the `cart` entity used by the generated API client's collection types. It exists so that the generated client code has a single, typed source for default/sample cart data.

## Key elements

- **`collectionValues`** (exported const, typed as `CollectionValues`) — The sole export. Its value is `{ byProperty: { quantity: 2 } }`, supplying a sample `quantity` of `2` for cart collection responses.

## Relationships

- **`scenarios/collection-values.ts`** — This file imports the `CollectionValues` type from there, which constrains the shape of `collectionValues` to the shared collection-values schema.

## Notes

- The object is typed, not an inline literal, so adding or removing a key in `collectionValues.ts` will produce a compile error here if the shapes diverge.
- The value is a frozen, single-purpose example (quantity = 2); it is not intended for runtime mutation or runtime business logic.
