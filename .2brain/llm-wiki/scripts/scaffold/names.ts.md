---
source: scripts/scaffold/names.ts
sha256: 74fc4c2acaf31a1835c854f58bae109029aeadefce0003f0f93928452483eb7c
generated_at: 2026-10-29T01:43:21.207024+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/names.ts

## Purpose

Centralises the derivation of every casing/spelling of a new module's name from a single validated folder name, so that no template or downstream script re-derives (and potentially mis-derives) its own variant. Also produces the fixed set of permission rule IDs and set name that a scaffolded module introduces.

## Key elements

- **`ModuleNames`** (interface) — the single shape holding all derived spellings: `kebab`, `identifier`, `entity`, `entityCamel`, `entitySnake`, `plural`, `pluralCamel`, `basePath`, `words`.
- **`isValidModuleName`** — regex guard; accepts lower-case letter segments separated by single hyphens. Digits are refused on purpose.
- **`isValidEntityName`** — regex guard for a PascalCase identifier (one or more letter segments, first letter upper).
- **`deriveNames(kebab, entityOverride?)`** — the main entry point. Converts the kebab folder name into every other spelling. The optional `entityOverride` lets the caller supply a singular noun the built-in naive singulariser would get wrong.
- **`RULE_ACTIONS`** — `readonly ['read', 'create', 'update', 'delete']`; the fixed action list used to build permission rules.
- **`permissionRules(names)`** — returns one rule ID string per action, e.g. `['read:FieldNote', 'create:FieldNote', …]`.
- **`permissionSetName(names)`** — returns the single permission-set name, e.g. `FieldNoteManagement`.
- Internal helpers (not exported): `pascal`, `lowerFirst`, `snake`, `singular`, `pluralOf` — pure casing/noun utilities used only inside `deriveNames`.

## Relationships

- **scripts/scaffold/options.ts** — supplies the validated kebab name and any `entityOverride` that `deriveNames` consumes.
- **scripts/scaffold/plan.ts** — orchestrates the scaffold; reads the `ModuleNames` object and passes it to the template generators.
- **scripts/scaffold/templates-code.ts / templates-contract.ts / templates-documentation-tests.ts** — consume individual `ModuleNames` fields (e.g. `entity`, `identifier`, `basePath`, `words`) to fill in generated files.
- **scripts/scaffold/central-edits.ts** — calls `permissionRules` and `permissionSetName` to produce the edits that register a new module's permissions in central config.
- **scripts/scaffold/registry.ts** — consumes `ModuleNames` (and the permission helpers) when building or updating the module registry.
- **src/modules.ts** — the file referenced by the `identifier` field; the scaffolded default-import name lands here.
- **tests/unit/scripts/scaffold/names.test.ts** — unit tests for the derivation, validation, and permission helpers in this file.
- **tests/unit/scripts/scaffold/central-edits.test.ts / registry.test.ts** — exercise `permissionRules`/`permissionSetName` indirectly through their respective modules.

## Notes

- The built-in `singular` helper is intentionally naive (`-ies`→`-y`, drop trailing `s` unless it's `ss`). Irregular nouns must be supplied via `entityOverride`; do not expect the helper to handle them.
- `pluralOf` guards against a folder whose PascalCase equals the entity (e.g. `Catalog`): it appends `s` so the collection type name (`Catalogs`) never collides with the entity type name.
- `RULE_ACTIONS` is declared `as const`, so it is a readonly 4-tuple, not a plain `string[]`. Consumers relying on the exact tuple type should preserve that.
- Module names are **letters-only**; any name containing a digit will fail `isValidModuleName` even if it looks otherwise valid.
