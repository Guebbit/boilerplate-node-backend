---
source: tests/cross-cutting/translatable-targets.test.ts
sha256: 146eaf340634f8a3f1173dca9a3be01aa428da8fc8d3ecbce365568ee0f2ea40
generated_at: 2026-10-15T12:41:34.590375+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/translatable-targets.test.ts

## Purpose

Cross-cutting validation that every entry in the `translatables` manifest names a real Mongoose collection and real schema fields on it. Without this test, a typo or renamed field would remain invisible until a user's first translation edit triggers a 500. It exists so registry drift surfaces in CI, not in production.

## Key elements

- **`translatables`** — resolved via `resolveTranslatables(enabledModules)`; the full set of translatable targets for currently enabled modules.
- **`modelsByCollection`** — `Map<collectionName, MongooseModel>` built from `mongoose.modelNames()`, used to look up whether a collection exists and to inspect its schema.
- **`entries`** — `Object.entries(translatables)`; may be empty when no deployed module owns translatable content.
- **`it.each` — "names a collection an actual model owns"** (conditional on `entries.length > 0`) — asserts `modelsByCollection.has(target.collection)`.
- **`it.each` — "names fields the collection's schema actually declares"** (conditional on `entries.length > 0`) — for each field in `target.fields`, asserts `registeredModel.schema.path(field)` is defined.
- **Canary test** — if the `products` module is deployed, `entries.length` must be > 0, guaranteeing the registry is actually being read and not silently empty.

## Relationships

- **`src/kernel/registry.ts`** — source of `resolveTranslatables`, which resolves the translatable manifest for a given set of modules. This test is its only consumer that validates the output against live Mongoose models.
- **`src/modules.ts`** — source of `enabledModules`, the module list fed into `resolveTranslatables`.
- **`tests/support/paths.ts`** — source of `isDeployed`, used in the canary test to check whether `products` is active.

## Notes

- The two `it.each` blocks are wrapped in an `if (entries.length > 0)` guard because Jest's `it.each` throws on an empty table. When no translatable content is deployed, those checks are skipped entirely rather than failing.
- The canary test exists precisely to prevent the "empty registry" edge case from masking a broken `resolveTranslatables` call: if `products` is deployed, the registry *must* be non-empty.
- The test depends on Mongoose models being registered (i.e., imported) before it runs; it reads the global Mongoose model registry rather than importing each schema directly.
