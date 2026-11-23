---
source: src/infrastructure/persistence/retired-indexes.ts
source_sha256: 4eba43c641ed4fedd065219bfb7bb4e9dafcb4ebea0f7a6f329f85c4e66e9c55
context_sha256: 5e3dddaf6921ed003fa7d3e298e6b684722808f31da7e73bd5ac152acc4369fe
generated_at: 2026-11-22T03:03:58.554713+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/retired-indexes.ts

## Purpose
Registry of index names that a schema has given up. `db:sync` only ever adds indexes, so an index nobody declares any more would otherwise remain in the database forever. Declaring the retired name here, next to the schema, tells the sync it is safe to drop.

## Key elements
- `retired` (private): a `WeakMap<object, readonly string[]>` keyed by the schema object itself. Retired names can be declared without adding a field to the model type and read without a cast.
- `retireIndexes(schema, ...names)`: records stored index names (as `db.collection.getIndexes()` prints them) as retired for that schema. Repeated calls accumulate names. It returns the same schema, so it can be chained at the end of a schema definition. It is meant to be called once, alongside the schema's definition.
- `retiredIndexesOf(schema)`: returns the retired names for a schema, or an empty array if it has none.

## Relationships
- `scripts/db/index-sync.ts`: the `db:sync` consumer. Per the module doc, it uses these declarations to learn which indexes it may drop.
- `tests/integration/scripts/db/index-sync.test.ts`: integration test for the sync script, which is the consumer of this registry.

## Notes
- Names must match the stored index names, not the schema's field definitions.
- Because the map is keyed by object identity, `retiredIndexesOf` must receive the same schema object that was passed to `retireIndexes`.
- `WeakMap` keys do not keep a schema alive, so the registry does not prevent garbage collection.
