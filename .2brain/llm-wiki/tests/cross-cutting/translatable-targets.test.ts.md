---
source: tests/cross-cutting/translatable-targets.test.ts
sha256: e9003c735d00a56cff1b98b3f98065f770e2a87885751225f8be029f08ec7708
generated_at: 2026-11-14T23:08:16.542336+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/translatable-targets.test.ts

## Purpose

Validates that every entry in the `translatables` manifest references a Mongoose collection that is actually registered and that every field listed in `fieldRules.shape` exists on that collection's schema. Without this check, a typo'd collection name or renamed field would surface as a 500 on a user's first translation write, since no other code reads these values before the write path.

## Key elements

- **`translatables`** — the resolved manifest, obtained via `resolveTranslatables(enabledModules)`.
- **`modelsByCollection`** — a `Map<string, Model>` built from `mongoose.modelNames()`, keyed by the model's actual collection name. Used as the lookup table for assertions.
- **`entries`** — `Object.entries(translatables)`, the list of `(entityType, target)` pairs to validate.
- **Conditional `it.each` blocks** — two per-entry assertions (collection exists, fields exist on schema) registered only when `entries.length > 0`.
- **Canary test** — asserts `entries.length > 0` is equivalent to `isDeployed('products')`, ensuring an empty registry means "nothing translatable is deployed" rather than "the manifest silently stopped being read."

## Relationships

- **`src/kernel/registry.ts`** — provides `resolveTranslatables`, the function that builds the manifest from module contributions.
- **`src/modules.ts`** — provides `enabledModules`, the list passed into `resolveTranslatables`.
- **`tests/support/paths.ts`** — provides `isDeployed`, used by the canary test to check whether the `products` module is active in the current environment.

## Notes

- The two `it.each` tests are **conditionally registered** (guarded by `if (entries.length > 0)`). In environments where no module contributes translatable content, the suite runs only the canary test. This is intentional: `it.each` over an empty table registers zero tests, which would make a broken manifest indistinguishable from a legitimately empty one.
- The canary test hard-codes `products` as the module that is expected to register a translatable entry. If another module becomes the sole owner of translatable content, this assertion will need updating.
