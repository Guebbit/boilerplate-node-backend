---
source: scenarios/values/cart.ts
sha256: 3cd4bde6eb1cea83f3015ec9964beb15e123fb921d449a86864ad0244df8a164
generated_at: 2026-11-08T02:36:03.875515+00:00
model: ollama:qwen3.8:27b
---

# scenarios/values/cart.ts

## Purpose

Provides the example/test values for the **cart** collection in the generated API client. It exists so that integration or scenario tests have a consistent, typed payload to exercise the cart endpoint.

## Key elements

- **`collectionValues`** (exported const, typed `CollectionValues`) — The sole export. Resolves to `{ byProperty: { quantity: 2 } }`, representing a minimal cart scenario where the only meaningful property under test is `quantity`.

## Relationships

- **`scenarios/collection-values.ts`** — Supplies the `CollectionValues` type that `collectionValues` is annotated against. This file is the type contract; `cart.ts` is one concrete implementation of it.

## Notes

- The object shape `{ byProperty: { … } }` is a convention of the `CollectionValues` type, not a domain concept — "byProperty" is a key in the test harness, not a cart field.
- Only `quantity` is specified; any other cart properties are expected to be omitted (i.e. default/undefined) in the scenario.
