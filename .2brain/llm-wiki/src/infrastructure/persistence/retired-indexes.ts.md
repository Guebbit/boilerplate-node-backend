---
source: src/infrastructure/persistence/retired-indexes.ts
sha256: 903163811deebb4f206233c76f4b345dd77cb192bc15fa94a485f805045c428c
generated_at: 2026-10-29T02:13:38.697894+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/retired-indexes.ts

## Purpose

`db:sync` only ever **adds** indexes; it never removes ones that are no longer declared. Without an explicit signal, a renamed or deleted index name would linger in the database indefinitely. This module gives each schema a way to declare "I have given up on these index names" so the sync script knows it is safe to drop them.

## Key elements

- **`retireIndexes<T>(schema, ...names): T`** — Registers one or more retired index names for a schema. Mutates a module-private `WeakMap`, then returns the same schema object so it can be chained at the end of a `new Schema({...})` expression in a `model.ts` file.
- **`retiredIndexesOf(schema): readonly string[]`** — Reads back the retired names registered for a given schema. Returns an empty array when the schema has none.
- **`retired` (module-private)** — A `WeakMap<object, readonly string[]>` keyed by the schema object itself. Avoids adding a field to the Mongoose `Schema` type and avoids casts on the reading side.

## Relationships

- **`scripts/db/index-sync.ts`** — The `db:sync` script calls `retiredIndexesOf` during its sync pass. Index names returned by this function are the set that `db:sync` is allowed to **drop** (as opposed to its normal add-only behavior).
- **`tests/integration/scripts/db/index-sync.test.ts`** — Integration tests that exercise the drop path, exercising `retireIndexes` + `retiredIndexesOf` through the sync script.

## Notes

- The key is the schema **object identity**, not a string name. This means `retireIndexes` must be called on the same schema instance that `db:sync` later reads — calling it on a copy or a second `new Schema(...)` will not link up.
- `retireIndexes` is designed to be the **last** expression in a schema definition chain (e.g. `export const User = model('User', retireIndexes(schema, 'oldName'))`), not a standalone statement.
- The index names passed in must match exactly what `db.collection.getIndexes()` prints (e.g. `{ a: 1, b: -1 }` → `"a_1_b_-1"`), because `db:sync` does a string comparison.
