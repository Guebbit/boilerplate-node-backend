---
source: tests/cross-cutting/translatable-targets.test.ts
sha256: 6e37a762ea2aaf9305fcf34c0f1b27ead5ada0c211cbad30f22b28e918e8a374
generated_at: 2026-09-23T20:00:56.414075+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/translatable-targets.test.ts

## Purpose
Validates that every entry in the resolved `translatables` manifest references a real Mongoose collection and real fields declared on that collection's schema. This catches typos or renamed fields at test time rather than letting them surface as a 500 error on a user's first translation edit.

## Key elements
- **`translatables`** – The resolved map (keyed by entity type) produced by calling `resolveTranslatables(enabledModules)`. Each value carries `collection` and `fields`.
- **`modelsByCollection`** – A `Map<string, Model>` built at module load from `mongoose.modelNames()`, indexed by the model's actual collection name. Used as the lookup table for both assertions.
- **`it.each` – collection ownership check** – For every entity type, asserts `modelsByCollection.has(target.collection)` is true.
- **`it.each` – field existence check** – For every entity type, resolves the model and asserts `model.schema.path(field)` is defined for each field in `target.fields`.
- **Vacuity guard** – Asserts `Object.keys(translatables).length > 0` so the two `it.each` blocks can't pass silently on an empty manifest.

## Relationships
- **`src/kernel/registry.ts`** – Exports `resolveTranslatables`, which is called here to produce the manifest under test.
- **`src/modules.ts`** – Exports `enabledModules`, the input passed to `resolveTranslatables`. Changing which modules are enabled directly changes the set of entries this test iterates over.

## Notes
- The test depends on all Mongoose models being registered at the time the test file is imported (i.e., the full app module graph must be loaded before this file executes). If a model is registered conditionally or lazily, it will be absent from `modelsByCollection` and the assertion will fail even though the manifest is correct.
- `target!` (non-null assertion) is used throughout; the type system allows `target` to be `undefined`, but the test treats a missing target as a manifest bug rather than a valid state.
- This test is intentionally cross-cutting: it doesn't test one module in isolation but the *consistency* between the registry output and the live Mongoose schema.
