---
source: scripts/scaffold/names.ts
sha256: cd66bb1bcf23bbe736356dcc37fb00cdb9c022f362a706f9deb32c2827639d28
generated_at: 2026-11-08T02:59:44.384093+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/names.ts

## Purpose

Derives every casing variant of a module's name (kebab, PascalCase, camelCase, snake_case, etc.) from a single validated folder name, so that downstream scaffold templates and plan steps consume one canonical `ModuleNames` object instead of each re-deriving its own spelling. Also produces the permission rule identifiers and set name that a scaffolded module introduces.

## Key elements

- **`ModuleNames`** (interface) — the single source of truth for all name spellings: `kebab`, `identifier`, `entity`, `entityCamel`, `entitySnake`, `entityKebab`, `plural`, `pluralKebab`, `pluralCamel`, `basePath`, `words`.
- **`deriveNames(kebab, entityOverride?)`** — main entry point; converts a validated folder name (and optional explicit entity) into a full `ModuleNames` object.
- **`isValidModuleName(name)`** — validates a folder name is lowercase letters + hyphens only (no digits).
- **`isValidEntityName(entity)`** — validates a PascalCase identifier.
- **`RULE_ACTIONS`** — frozen tuple `['read', 'create', 'update', 'delete']` in declaration order.
- **`permissionRules(names)`** — returns one rule-id string per action, e.g. `read:FieldNote`.
- **`permissionSetName(names)`** — returns the bundled permission-set name, e.g. `FieldNoteManagement`.
- Internal helpers: `pascal`, `lowerFirst`, `snake`, `hyphenate`, `singular`, `pluralOf`.

## Relationships

- **`scripts/scaffold/templates-code.ts`, `templates-contract.ts`, `templates-documentation-tests.ts`** — consume the `ModuleNames` fields to fill in code, contract, and documentation/test templates without re-deriving casing.
- **`scripts/scaffold/central-edits.ts`** — uses `permissionRules` / `permissionSetName` (and likely `identifier`) when generating the central-file edits for a new module.
- **`scripts/scaffold/plan.ts`** — receives the derived names to assemble the ordered list of scaffold operations.
- **`scripts/scaffold/options.ts`** — supplies the validated `kebab` (and optional `entityOverride`) that feeds `deriveNames`.
- **`src/modules.ts`** — the `identifier` field (`fieldNotes`) is the exact default-import identifier this file expects to appear in `src/modules.ts`.
- **`tests/unit/scripts/scaffold/names.test.ts`** — direct unit tests for every export in this file.

## Notes

- `singular()` is intentionally naive (`-ies`→`-y`, drop trailing `s` unless `ss`). Irregular nouns must be supplied via the `entityOverride` parameter.
- `pluralOf` guards against the folder and entity collapsing to the same PascalCase string (e.g. `Catalog` folder + `Catalog` entity → plural becomes `Catalogs`).
- `RULE_ACTIONS` order is the declaration order used when emitting permission rules; do not reorder it without updating dependent consumers.
- The regex `MODULE_NAME` rejects digits entirely — this is a deliberate policy, not an oversight.
