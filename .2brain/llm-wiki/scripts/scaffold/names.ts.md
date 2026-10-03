---
source: scripts/scaffold/names.ts
sha256: 0361a9dc8ed8e1d5c406980512b426a5f830c65e96b3950cb8d7009c0abfd3b4
generated_at: 2026-10-01T12:39:04.866972+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/names.ts

## Purpose

Centralises the derivation of every name spelling a scaffolded module needs (kebab-case, camelCase, PascalCase, snake_case, etc.) from a single validated folder name, so that no template re-derives—and potentially mis-derives—its own casing.

## Key elements

- **`ModuleNames` (interface)** — The single shape that holds all derived spellings: `kebab`, `identifier`, `family`, `entity`, `entityCamel`, `entitySnake`, `plural`, `pluralCamel`, `basePath`, `words`.
- **`isValidModuleName(name)`** — Validates a candidate folder name against `/^[a-z]+(-[a-z]+)*$/`. Digits are deliberately rejected (permission-key grammar is `[a-z.]` only).
- **`isValidEntityName(entity)`** — Validates a candidate PascalCase record-type name against `/^[A-Z][A-Za-z]*$/`.
- **`deriveNames(kebab, entityOverride?)`** — The main entry point. Produces a full `ModuleNames` object. Accepts an optional `entityOverride` to bypass the naive singulariser for irregular nouns.
- **`KEY_ACTIONS`** — Const tuple `['read', 'create', 'update', 'delete']`; the actions every scaffolded module's permission keys cover.
- **`permissionKeys(names)`** — Returns the four permission-key strings (e.g. `fieldnotes.any.read`) for a given `ModuleNames`.
- **Internal helpers** (not exported): `pascal`, `lowerFirst`, `snake`, `singular`, `pluralOf` — pure string-case conversion and simple English singular/plural logic.

## Relationships

- **`scripts/scaffold/plan.ts`** — Calls `deriveNames` (and likely the validators) to build the scaffold plan before any file is written.
- **`scripts/scaffold/options.ts`** — Supplies the `kebab` folder name and the optional `entityOverride` that flow into `deriveNames`.
- **`scripts/scaffold/templates-code.ts`**, **`templates-contract.ts`**, **`templates-documentation-tests.ts`** — All consume the `ModuleNames` object to inject correct identifiers, type names, route paths, and prose words into generated code, contracts, and tests.
- **`scripts/scaffold/central-edits.ts`** — Reads the derived names (e.g. `identifier`, `family`) when generating or patching the central `src/modules.ts` registry entry and permission grants.
- **`scripts/scaffold/registry.ts`** — Uses `deriveNames` output to build or look up registry records keyed by the module's `family` or `kebab`.
- **`src/modules.ts`** — The `identifier` field in `ModuleNames` is the exact default-import name expected here; `central-edits.ts` inserts it.
- **`tests/unit/scripts/scaffold/names.test.ts`** — Direct unit tests for the validators, `deriveNames`, and `permissionKeys`.
- **`tests/unit/scripts/scaffold/central-edits.test.ts`**, **`registry.test.ts`** — Exercise the names this file exports indirectly through the central-edits and registry code paths.

## Notes

- **Naive singularisation is intentionally limited.** `singular` only handles `-ies → -y` and trailing `-s` (preserving `-ss`). Irregular nouns (e.g. "catalog" → "catalogue") must be corrected via the `entityOverride` parameter; there is no dictionary.
- **`family` strips hyphens** because the permission-key grammar permits only `[a-z.]`. This is why digits are rejected at validation time — a digit in the folder name would leak into the key.
- **`pluralOf` guard:** if the PascalCase folder name equals the entity (e.g. `Catalog` / `Catalog`), the plural is formed as `entity + 's'` to avoid a type-name collision between the record and the collection.
- **`snake` helper** lower-cases every remaining uppercase letter and prepends an underscore; it assumes the input is already PascalCase (i.e. `lowerFirst` has been applied). Feeding it a multi-word PascalCase string with internal boundaries (e.g. `FieldNote`) works, but a string with no internal capitals (e.g. a single word) yields the input unchanged.
