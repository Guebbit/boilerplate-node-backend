---
source: scripts/scaffold/names.ts
sha256: e2026be58a613d6b6e70aab78c2443f425256e109e8b8b6062bb6b2fc669a5d2
generated_at: 2026-11-14T17:41:25.945024+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/names.ts

## Purpose

Single source of truth for every case-spelling of a new module's name. Derives all variants (kebab, PascalCase, camelCase, snake_case, etc.) once from the folder name so that no downstream template or generator re-derives—and risks mis-deriving—its own casing.

## Key elements

- **`ModuleNames`** (interface) — the complete set of derived spellings: `kebab`, `identifier`, `entity`, `entityCamel`, `entitySnake`, `entityKebab`, `plural`, `pluralKebab`, `pluralCamel`, `basePath`, `words`.
- **`deriveNames(kebab, entityOverride?)`** — main entry point. Takes a validated folder name and an optional explicit entity name; returns a populated `ModuleNames`.
- **`isValidModuleName(name)`** — validates a kebab-case folder name (lowercase letters and hyphens only; digits are deliberately excluded).
- **`isValidEntityName(entity)`** — validates a PascalCase record-type name.
- **`singular(word)`** (private) — naive singularization: `-ies`→`-y`, drop trailing `s` unless it is `ss`. Fails for irregular nouns; that is what `entityOverride` exists for.
- **`pluralOf(folder, entity)`** (private) — ensures the plural type-name stem never collides with the entity name by appending `s` when they would be identical.
- **`RULE_ACTIONS`** — const tuple `['read', 'create', 'update', 'delete']`, the fixed set of permission actions a scaffolded module covers, in declaration order.
- **`permissionSetName(names)`** — produces the permission-set identifier (e.g. `FieldNoteManagement`) from a `ModuleNames`.
- **`pascal`, `lowerFirst`, `snake`, `hyphenate`** (private) — case-conversion helpers used by `deriveNames`.

## Relationships

- **`scripts/scaffold/options.ts`** — calls `isValidModuleName` / `isValidEntityName` to validate CLI arguments before scaffolding.
- **`scripts/scaffold/plan.ts`** — calls `deriveNames` to obtain the full `ModuleNames` used when building the scaffold plan.
- **`scripts/scaffold/central-edits.ts`** — consumes the `ModuleNames` object to generate the registration entry written into `src/modules.ts`.
- **`scripts/scaffold/registry.ts`** — consumes `ModuleNames` fields when producing registry-related artifacts.
- **`scripts/scaffold/templates-code.ts`**, **`scripts/scaffold/templates-contract.ts`**, **`scripts/scaffold/templates-documentation-tests.ts`** — read `ModuleNames` fields and `RULE_ACTIONS` / `permissionSetName` to substitute correct names into generated code, contracts, and test/documentation templates.
- **`src/modules.ts`** — the target file whose default-import identifier and mount path are captured in the `ModuleNames` object.
- **`tests/unit/scripts/scaffold/names.test.ts`** — direct unit tests for validation, derivation, and helper correctness.
- **`tests/unit/scripts/scaffold/central-edits.test.ts`**, **`tests/unit/scripts/scaffold/registry.test.ts`** — exercise `deriveNames` indirectly through their respective modules.

## Notes

- **Naive singularization:** `singular` only handles `-ies`→`-y` and a trailing `s`. Irregular nouns (e.g. `catalog`, `index`) require the caller to pass `entityOverride` explicitly; there is no dictionary lookup.
- **Collision guard:** `pluralOf` appends `s` when the folder's PascalCase would equal the entity (e.g. folder `catalog` + entity `Catalog` → plural `Catalogs`), preventing the type-name stem from colliding with the singular record type.
- **No digits allowed:** `MODULE_NAME` rejects any digit in folder names by design; module names are purely alphabetic and hyphenated.
- **`RULE_ACTIONS` order is significant:** it is a `const` tuple consumed in declaration order when generating permission rules.
