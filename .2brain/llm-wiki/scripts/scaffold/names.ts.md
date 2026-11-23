---
source: scripts/scaffold/names.ts
source_sha256: e2026be58a613d6b6e70aab78c2443f425256e109e8b8b6062bb6b2fc669a5d2
context_sha256: 6534a1007c01e3fffb22ba08e4519e44071e29d735679c02df71da79df67da08
generated_at: 2026-11-22T02:15:44.942479+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/names.ts

## Purpose
Derives every spelling of a new module's name (kebab, camel, Pascal, snake, plural, paths, prose) once from the folder name, so scaffold templates never re-derive casing themselves. It also holds the validators for module and entity names and a few shared constants.

## Key elements
- `ModuleNames` — interface holding all derived spellings: `kebab`, `identifier`, `entity`, `entityCamel`, `entitySnake`, `plural`, `entityKebab`, `pluralKebab`, `pluralCamel`, `basePath`, `words`.
- `isValidModuleName(name)` — true for lower-case letters only, hyphen-separated (`^[a-z]+(?:-[a-z]+)*$`). Digits are deliberately refused.
- `isValidEntityName(entity)` — true for PascalCase letters only (`^[A-Z][A-Za-z]*$`).
- `deriveNames(kebab, entityOverride?)` — builds a `ModuleNames` from the folder name. The entity is `entityOverride` if given, otherwise the naive singular of the PascalCased folder.
- `RULE_ACTIONS` — `['read', 'create', 'update', 'delete']`, the actions a scaffolded module's permission rules cover.
- `permissionSetName(names)` — returns `<Entity>Management`, e.g. `FieldNoteManagement`.
- Internal helpers: `pascal`, `lowerFirst`, `snake`, `hyphenate`, `singular`, `pluralOf`.

## Relationships
Its neighbors in the scaffold directory (`options.ts`, `plan.ts`, `registry.ts`, `central-edits.ts`, and the three `templates-*.ts` files) sit in the dependency graph around it. This page can't confirm which of them import which symbols. The intended consumers of `ModuleNames` are the templates, per the file's header. `src/modules.ts` is mentioned only in the `identifier` doc comment, as where that default-import name is used. The unit tests in `tests/unit/scripts/scaffold/names.test.ts`, `central-edits.test.ts` and `registry.test.ts` are test-side neighbors.

## Notes
- The singular rule is naive: `-ies` becomes `-y`, a trailing `s` is dropped unless the word ends in `ss`. It is wrong for irregular nouns, which is what the `--entity` override is for.
- `pluralOf` uses the PascalCase folder as the plural when it differs from the entity (`FieldNotes`). When they are equal it appends `s` (`Catalog` becomes `Catalogs`), so the entity and plural type names never collide.
- `entitySnake`, `entityKebab` and `pluralKebab` are derived from the PascalCase name by inserting separators before capitals, so they follow the entity or override casing, not the folder name directly.
