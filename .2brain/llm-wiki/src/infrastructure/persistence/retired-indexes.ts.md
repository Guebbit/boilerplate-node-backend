---
source: src/infrastructure/persistence/retired-indexes.ts
sha256: 903163811deebb4f206233c76f4b345dd77cb192bc15fa94a485f805045c428c
generated_at: 2026-11-08T03:44:11.926242+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/retired-indexes.ts

## Purpose

Provides a side-channel registry so that `db:sync` knows which existing MongoDB indexes are safe to drop. Because `db:sync` only ever *adds* indexes, a name that is no longer declared in a schema would otherwise persist forever. Schema modules call `retireIndexes` at the point of definition to record those names.

## Key elements

- **`retireIndexes<T extends object>(schema: T, ...names: string[]): T`** — Records one or more index names as retired for the given schema. Returns the same schema so it can be chained as the last expression in a schema definition.
- **`retiredIndexesOf(schema: object): readonly string[]`** — Reads back the retired names for a schema. Returns an empty array when none were recorded.
- **`retired` (internal)** — A `WeakMap<object, readonly string[]>` that stores the mapping. Using the schema object itself as the key means no extra field is needed on the model type and no cast is required on the reading side. Schemas are garbage-collected once no references remain.

## Relationships

- **`scripts/db/index-sync.ts`** — The consumer. `db:sync` calls `retiredIndexesOf(schema)` for each schema it processes; any index whose name appears in the returned list and still exists in the collection is dropped.
- **`tests/integration/scripts/db/index-sync.test.ts`** — Exercises the drop path by calling `retireIndexes` in test schemas and asserting that `db:sync` removes the matching indexes.

## Notes

- Names passed to `retireIndexes` must match exactly what `db.collection.getIndexes()` returns (e.g. `fieldName_1` format), not the logical Mongoose index declaration.
- The function is idempotent per call (appends) but is intended to be called once per schema in that module's `model.ts`. Calling it twice for the same schema accumulates names in the internal array.
- Because the key is the schema *object* (not a string name), two separate `Schema` instances with identical fields are tracked independently.
