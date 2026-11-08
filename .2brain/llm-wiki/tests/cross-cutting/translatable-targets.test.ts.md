---
source: tests/cross-cutting/translatable-targets.test.ts
sha256: 146eaf340634f8a3f1173dca9a3be01aa428da8fc8d3ecbce365568ee0f2ea40
generated_at: 2026-11-08T09:33:28.796714+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/translatable-targets.test.ts

## Purpose

Validates that every entry in the resolved `translatables` manifest references a real Mongoose collection and fields that actually exist on that collection's schema. Catches typos or renamed fields at test time instead of letting them surface as a 500 on a user's first translation write.

## Key elements

- **`translatables`** — resolved manifest produced by `resolveTranslatables(enabledModules)`; the data under test.
- **`modelsByCollection`** — a `Map` built from `mongoose.modelNames()`, keyed by each model's actual collection name so lookups are O(1).
- **`"…names a collection an actual model owns"`** — asserts the `target.collection` string matches a registered Mongoose collection.
- **`"…names fields the collection's schema actually declares"`** — iterates `target.fields` and asserts each one resolves via `schema.path(field)`.
- **`"has an entry whenever products…is deployed"`** — canary test: if the `products` module is deployed, the registry must be non-empty (guards against the manifest silently going unread).

## Relationships

- **`src/kernel/registry.ts`** — provides `resolveTranslatables`, the function that merges per-module translatables manifests into the final map under test.
- **`src/modules.ts`** — provides `enabledModules`, the list of currently-enabled modules fed into `resolveTranslatables`.
- **`tests/support/paths.ts`** — provides `isDeployed`, used by the canary test to determine whether the `products` module should be contributing entries.

## Notes

- The two `it.each` blocks are wrapped in `if (entries.length > 0)`. `it.each` throws on an empty table, so without this guard the suite would fail in environments where no module registers translatable content. The canary test compensates by asserting non-emptiness specifically when `products` is deployed.
- Tests run against the live Mongoose connection (models must be registered in the test environment); they do not mock the registry or the schemas.
