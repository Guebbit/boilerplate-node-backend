---
source: scripts/contracts/permission-vocabulary-render.ts
sha256: 057e85b4dbb7fc3248db79cfba675ddb7edfb425282199cdb7656a820470c476
generated_at: 2026-11-08T02:43:46.817085+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/permission-vocabulary-render.ts

## Purpose

Pure (no-filesystem) half of the permission-vocabulary code generator. It parses a shared `authorization-keys.yaml` document into a structured `PermissionVocabulary` and then renders the TypeScript module that exports the resulting closed lists, union types, and the subject-to-actions pair map. Because it performs no I/O, unit tests can exercise it in isolation.

## Key elements

- **`PermissionVocabulary`** (interface) — the shape returned by the reader: `actions`, `subjects`, `ruleIds`, `setNames`, `scopes`, `stepUpTiers`, and `pairs` (per-subject action lists).
- **`readPermissionVocabulary(yamlText)`** (exported) — parses the YAML string, extracts every closed list, and validates: non-empty string lists, no duplicate entries, and referential integrity (each rule's `action`, `scope`, and optional `stepUp` must appear in the corresponding declared list). Throws descriptive `Error`s on any violation.
- **`renderPermissionVocabulary(vocabulary)`** (exported) — turns a `PermissionVocabulary` into the full text of the generated `.ts` file: each list as an `as const` array + its element union type, the `PERMISSION_PAIRS` object, and the `ActionOn<S>` generic type.
- **`stringList`, `mappingKeys`, `fieldOfEach`, `assertUnique`** (internal) — small validators that extract and guard individual fields from the parsed YAML.
- **`renderList`** (internal) — emits the `const` + `type` pair for one closed list.

## Relationships

- **`scripts/contracts/generate-permission-vocabulary.ts`** — the impure driver that reads the YAML file from disk and writes the rendered output; it calls into `readPermissionVocabulary` and `renderPermissionVocabulary` from this module.
- **`tests/unit/scripts/contracts/permission-vocabulary-render.test.ts`** — unit tests that feed YAML strings through `readPermissionVocabulary` and assert on `renderPermissionVocabulary` output, covering both happy-path rendering and each validation/error path.

## Notes

- The file header states it is **deliberately excluded from `SHARED_FILES`** and is kept identical across the two paired repos by hand ("Convenience is not necessity" — see `docs/tools/pairing-and-ports.md`). Do not add it to an auto-sync list.
- Validation is fail-fast and order-sensitive: referential checks (rule → declared action/scope/tier) happen *after* extraction but *before* `ruleIds` uniqueness is asserted.
- The generated output includes a `DO NOT EDIT` banner and names the regenerate command (`npm run gen:api`) and source file (`shared/authorization-keys.yaml`) so downstream editors know the provenance.
- `subjects` are deduplicated via a `Set` in first-seen order; `pairs` is built as a plain `Record<string, string[]>` keyed by subject.
